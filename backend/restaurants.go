package main

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

type restaurant struct {
	ID, OwnerID                          int64
	Name, Description, Cuisine, Location string
	Seats, OpenMin, CloseMin, ClosedDays int
	CancelMinutes, LimitedPct            int
	RatingSum, RatingCount               int
}

const restaurantCols = `id, owner_id, name, description, cuisine, location, seats,
	open_min, close_min, closed_days, cancel_minutes, limited_pct, rating_sum, rating_count`

func (r *restaurant) scanDest() []any {
	return []any{&r.ID, &r.OwnerID, &r.Name, &r.Description, &r.Cuisine, &r.Location, &r.Seats,
		&r.OpenMin, &r.CloseMin, &r.ClosedDays, &r.CancelMinutes, &r.LimitedPct, &r.RatingSum, &r.RatingCount}
}

func (r *restaurant) hours() Hours {
	return Hours{OpenMin: r.OpenMin, CloseMin: r.CloseMin, ClosedDays: r.ClosedDays}
}

// loadRestaurant โหลดร้าน ถ้า forUpdate = true จะล็อกแถวร้านไว้จนจบ transaction
// (ใช้ตอนจอง/รีวิว เพื่อให้คำขอพร้อมกันของร้านเดียวกันต้องต่อคิวกัน)
func loadRestaurant(ctx context.Context, q queryer, id int64, forUpdate bool) (*restaurant, error) {
	query := `SELECT ` + restaurantCols + ` FROM restaurants WHERE id = $1`
	if forUpdate {
		query += ` FOR UPDATE`
	}
	var r restaurant
	err := q.QueryRowContext(ctx, query, id).Scan(r.scanDest()...)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errf(http.StatusNotFound, "ไม่พบร้านนี้")
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

type restaurantJSON struct {
	ID            int64    `json:"id"`
	OwnerID       int64    `json:"owner_id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Cuisine       string   `json:"cuisine"`
	Location      string   `json:"location"`
	Seats         int      `json:"seats"`
	Open          string   `json:"open"`
	Close         string   `json:"close"`
	Overnight     bool     `json:"overnight"`
	ClosedDays    []int    `json:"closed_days"`
	CancelMinutes int      `json:"cancel_minutes"`
	LimitedPct    int      `json:"limited_pct"`
	Rating        float64  `json:"rating"`
	ReviewCount   int      `json:"review_count"`
	Cover         string   `json:"cover"`
	Images        []string `json:"images,omitempty"`
	IsMine        bool     `json:"is_mine"`
}

func (r *restaurant) toJSON(viewerID int64) restaurantJSON {
	days := []int{}
	for d := 0; d < 7; d++ {
		if r.ClosedDays&(1<<d) != 0 {
			days = append(days, d)
		}
	}
	rating := 0.0
	if r.RatingCount > 0 {
		rating = math.Round(float64(r.RatingSum)/float64(r.RatingCount)*10) / 10
	}
	return restaurantJSON{
		ID: r.ID, OwnerID: r.OwnerID, Name: r.Name, Description: r.Description,
		Cuisine: r.Cuisine, Location: r.Location, Seats: r.Seats,
		Open: formatHM(r.OpenMin), Close: formatHM(r.CloseMin), Overnight: r.hours().Overnight(),
		ClosedDays: days, CancelMinutes: r.CancelMinutes, LimitedPct: r.LimitedPct,
		Rating: rating, ReviewCount: r.RatingCount, IsMine: viewerID != 0 && viewerID == r.OwnerID,
	}
}

// GET /api/restaurants?sort=rated|reviews&q=คำค้น
func (a *App) handleListRestaurants(w http.ResponseWriter, r *http.Request) {
	viewer, err := a.currentUser(r)
	if err != nil {
		writeError(w, err)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	// Highest rated: ใช้ค่าเฉลี่ยถ่วงน้ำหนัก (Bayesian average)
	//   score = (ผลรวมคะแนน + m × ค่าเฉลี่ยทั้งระบบ) / (จำนวนรีวิว + m)   โดย m = 10 (ต้องมีรีวิวราว 10 รีวิว คะแนนจริงของร้านถึงมีน้ำหนักเกินครึ่ง)
	// ร้าน 5.0 จาก 1 รีวิว จะถูกดึงเข้าหาค่าเฉลี่ยของระบบ ไม่แซงร้าน 4.8 จาก 300 รีวิว
	order := `(r.rating_count > 0) DESC, score DESC, r.id`
	if r.URL.Query().Get("sort") == "reviews" {
		order = `r.rating_count DESC, score DESC, r.id`
	}
	rows, err := a.db.QueryContext(r.Context(), `
		WITH g AS (
			SELECT COALESCE(SUM(rating_sum)::float8 / NULLIF(SUM(rating_count), 0), 0) AS c FROM restaurants
		)
		SELECT r.id, r.owner_id, r.name, r.description, r.cuisine, r.location, r.seats,
		       r.open_min, r.close_min, r.closed_days, r.cancel_minutes, r.limited_pct, r.rating_sum, r.rating_count,
		       COALESCE((SELECT url FROM restaurant_images i WHERE i.restaurant_id = r.id ORDER BY position, id LIMIT 1), ''),
		       (r.rating_sum + 10 * g.c) / (r.rating_count + 10) AS score
		FROM restaurants r CROSS JOIN g
		WHERE $1 = '' OR r.name ILIKE $2 OR r.cuisine ILIKE $2 OR r.location ILIKE $2
		ORDER BY `+order+` LIMIT 100`, q, "%"+escapeLike(q)+"%")
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	list := []restaurantJSON{}
	for rows.Next() {
		var rs restaurant
		var cover string
		var score float64
		if err := rows.Scan(append(rs.scanDest(), &cover, &score)...); err != nil {
			writeError(w, err)
			return
		}
		j := rs.toJSON(userID(viewer))
		j.Cover = cover
		list = append(list, j)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

type reviewJSON struct {
	ID        int64     `json:"id"`
	UserName  string    `json:"user_name"`
	Rating    int       `json:"rating"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"created_at"`
}

type restaurantDetailJSON struct {
	restaurantJSON
	Reviews   []reviewJSON `json:"reviews"`
	CanReview bool         `json:"can_review"`
	MyReview  *reviewJSON  `json:"my_review"`
}

// GET /api/restaurants/{id}
func (a *App) handleGetRestaurant(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	viewer, err := a.currentUser(r)
	if err != nil {
		writeError(w, err)
		return
	}
	detail, err := a.restaurantDetail(r.Context(), id, viewer)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (a *App) restaurantDetail(ctx context.Context, id int64, viewer *User) (*restaurantDetailJSON, error) {
	rs, err := loadRestaurant(ctx, a.db, id, false)
	if err != nil {
		return nil, err
	}
	images, err := a.restaurantImages(ctx, a.db, id)
	if err != nil {
		return nil, err
	}
	d := &restaurantDetailJSON{restaurantJSON: rs.toJSON(userID(viewer)), Reviews: []reviewJSON{}}
	d.Images = images
	if len(images) > 0 {
		d.Cover = images[0]
	}
	d.CanReview = viewer != nil && !d.IsMine

	rows, err := a.db.QueryContext(ctx, `
		SELECT rv.id, u.name, rv.rating, rv.comment, rv.created_at, rv.user_id
		FROM reviews rv JOIN users u ON u.id = rv.user_id
		WHERE rv.restaurant_id = $1 ORDER BY rv.updated_at DESC LIMIT 50`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var rv reviewJSON
		var uid int64
		if err := rows.Scan(&rv.ID, &rv.UserName, &rv.Rating, &rv.Comment, &rv.CreatedAt, &uid); err != nil {
			return nil, err
		}
		if uid == userID(viewer) {
			mine := rv
			d.MyReview = &mine
		}
		d.Reviews = append(d.Reviews, rv)
	}
	return d, rows.Err()
}

func (a *App) restaurantImages(ctx context.Context, q queryer, id int64) ([]string, error) {
	rows, err := q.QueryContext(ctx,
		`SELECT url FROM restaurant_images WHERE restaurant_id = $1 ORDER BY position, id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	urls := []string{}
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, rows.Err()
}

type restaurantInput struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Cuisine       string   `json:"cuisine"`
	Location      string   `json:"location"`
	Seats         int      `json:"seats"`
	Open          string   `json:"open"`
	Close         string   `json:"close"`
	ClosedDays    []int    `json:"closed_days"`
	CancelMinutes int      `json:"cancel_minutes"`
	LimitedPct    int      `json:"limited_pct"`
	Images        []string `json:"images"`
}

// validate ตรวจข้อมูลร้าน แล้วคืนค่าที่แปลงพร้อมบันทึก
func (in *restaurantInput) validate() (*restaurant, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 100 {
		return nil, errf(http.StatusBadRequest, "กรุณากรอกชื่อร้าน (ไม่เกิน 100 ตัวอักษร)")
	}
	if in.Seats < 1 || in.Seats > 1000 {
		return nil, errf(http.StatusBadRequest, "จำนวนที่นั่งต้องอยู่ระหว่าง 1–1000")
	}
	open, err1 := parseHM(in.Open)
	closeM, err2 := parseHM(in.Close)
	if err1 != nil || err2 != nil {
		return nil, errf(http.StatusBadRequest, "รูปแบบเวลาเปิด-ปิดไม่ถูกต้อง (HH:MM)")
	}
	if open == closeM {
		return nil, errf(http.StatusBadRequest, "เวลาเปิดและเวลาปิดต้องไม่เท่ากัน")
	}
	if in.CancelMinutes == 0 {
		in.CancelMinutes = 30 // ค่าตั้งต้นของระบบ
	}
	if in.CancelMinutes < 30 {
		return nil, errf(http.StatusUnprocessableEntity, "เวลายกเลิกล่วงหน้าต้องไม่น้อยกว่า 30 นาที")
	}
	if in.LimitedPct < 0 || in.LimitedPct > 100 {
		return nil, errf(http.StatusBadRequest, "เกณฑ์ Limited Seats ต้องอยู่ระหว่าง 0–100%%")
	}
	mask := 0
	for _, d := range in.ClosedDays {
		if d < 0 || d > 6 {
			return nil, errf(http.StatusBadRequest, "วันหยุดไม่ถูกต้อง")
		}
		mask |= 1 << d
	}
	if mask == 0b1111111 {
		return nil, errf(http.StatusBadRequest, "ร้านต้องเปิดอย่างน้อย 1 วัน")
	}
	if len(in.Images) < 1 {
		return nil, errf(http.StatusBadRequest, "ต้องมีรูปร้านอย่างน้อย 1 รูป")
	}
	if len(in.Images) > 10 {
		return nil, errf(http.StatusBadRequest, "ใส่รูปได้ไม่เกิน 10 รูป")
	}
	for _, u := range in.Images {
		if !strings.HasPrefix(u, "/uploads/") { // รับเฉพาะรูปที่อัปโหลดผ่านระบบ
			return nil, errf(http.StatusBadRequest, "รูปภาพไม่ถูกต้อง")
		}
	}
	return &restaurant{
		Name: in.Name, Description: strings.TrimSpace(in.Description),
		Cuisine: strings.TrimSpace(in.Cuisine), Location: strings.TrimSpace(in.Location),
		Seats: in.Seats, OpenMin: open, CloseMin: closeM, ClosedDays: mask,
		CancelMinutes: in.CancelMinutes, LimitedPct: in.LimitedPct,
	}, nil
}

func replaceImages(ctx context.Context, tx *sql.Tx, restID int64, urls []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM restaurant_images WHERE restaurant_id = $1`, restID); err != nil {
		return err
	}
	for i, u := range urls {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO restaurant_images (restaurant_id, url, position) VALUES ($1, $2, $3)`, restID, u, i); err != nil {
			return err
		}
	}
	return nil
}

// POST /api/restaurants — ใครที่ login แล้วก็สร้างร้านของตัวเองได้
func (a *App) handleCreateRestaurant(w http.ResponseWriter, r *http.Request, u *User) {
	var in restaurantInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	rs, err := in.validate()
	if err != nil {
		writeError(w, err)
		return
	}
	ctx := r.Context()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()
	err = tx.QueryRowContext(ctx, `
		INSERT INTO restaurants (owner_id, name, description, cuisine, location, seats,
			open_min, close_min, closed_days, cancel_minutes, limited_pct)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
		u.ID, rs.Name, rs.Description, rs.Cuisine, rs.Location, rs.Seats,
		rs.OpenMin, rs.CloseMin, rs.ClosedDays, rs.CancelMinutes, rs.LimitedPct).Scan(&rs.ID)
	if err == nil {
		err = replaceImages(ctx, tx, rs.ID, in.Images)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, err)
		return
	}
	detail, err := a.restaurantDetail(ctx, rs.ID, u)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, detail)
}

// PUT /api/restaurants/{id} — แก้ได้เฉพาะเจ้าของ ตรวจที่ API ไม่ใช่แค่ซ่อนปุ่ม
func (a *App) handleUpdateRestaurant(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var in restaurantInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	rs, err := in.validate()
	if err != nil {
		writeError(w, err)
		return
	}
	ctx := r.Context()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()
	cur, err := loadRestaurant(ctx, tx, id, true)
	if err != nil {
		writeError(w, err)
		return
	}
	if cur.OwnerID != u.ID {
		writeError(w, errf(http.StatusForbidden, "แก้ไขได้เฉพาะร้านของตัวเอง"))
		return
	}
	_, err = tx.ExecContext(ctx, `
		UPDATE restaurants SET name=$2, description=$3, cuisine=$4, location=$5, seats=$6,
			open_min=$7, close_min=$8, closed_days=$9, cancel_minutes=$10, limited_pct=$11
		WHERE id = $1`,
		id, rs.Name, rs.Description, rs.Cuisine, rs.Location, rs.Seats,
		rs.OpenMin, rs.CloseMin, rs.ClosedDays, rs.CancelMinutes, rs.LimitedPct)
	if err == nil {
		err = replaceImages(ctx, tx, id, in.Images)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, err)
		return
	}
	detail, err := a.restaurantDetail(ctx, id, u)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// DELETE /api/restaurants/{id}
func (a *App) handleDeleteRestaurant(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	cur, err := loadRestaurant(r.Context(), a.db, id, false)
	if err != nil {
		writeError(w, err)
		return
	}
	if cur.OwnerID != u.ID {
		writeError(w, errf(http.StatusForbidden, "ลบได้เฉพาะร้านของตัวเอง"))
		return
	}
	// WHERE owner_id ซ้ำอีกชั้น กันกรณีเปลี่ยนเจ้าของระหว่างทาง
	if _, err := a.db.ExecContext(r.Context(),
		`DELETE FROM restaurants WHERE id = $1 AND owner_id = $2`, id, u.ID); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/me/restaurants
func (a *App) handleMyRestaurants(w http.ResponseWriter, r *http.Request, u *User) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT `+restaurantCols+`,
		  COALESCE((SELECT url FROM restaurant_images i WHERE i.restaurant_id = restaurants.id ORDER BY position, id LIMIT 1), '')
		FROM restaurants WHERE owner_id = $1 ORDER BY id`, u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	list := []restaurantJSON{}
	for rows.Next() {
		var rs restaurant
		var cover string
		if err := rows.Scan(append(rs.scanDest(), &cover)...); err != nil {
			writeError(w, err)
			return
		}
		j := rs.toJSON(u.ID)
		j.Cover = cover
		list = append(list, j)
	}
	writeJSON(w, http.StatusOK, list)
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

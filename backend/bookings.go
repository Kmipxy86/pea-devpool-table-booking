package main

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"
)

// ---------- ความว่างของร้าน ----------

type availabilityJSON struct {
	Date             string `json:"date"`
	Seats            int    `json:"seats"`
	Open             string `json:"open"`
	Close            string `json:"close"`
	Closed           bool   `json:"closed"`
	LimitedThreshold int    `json:"limited_threshold"` // เหลือที่นั่ง <= ค่านี้ ให้ขึ้นป้าย Limited Seats Left!
	Slots            []Slot `json:"slots"`
}

// overlapping ดึงการจองที่ยังไม่ยกเลิกและทับช่วง [from, to)
// excludeID ใช้ตอนแก้ไข: ไม่นับการจองเดิมของตัวเองซ้ำ (เฉพาะถ้าเป็นของ userID จริง)
func overlapping(ctx context.Context, q queryer, restID int64, from, to time.Time, excludeID, uid int64) ([]Interval, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT start_at, end_at, party FROM bookings
		WHERE restaurant_id = $1 AND status = 'confirmed'
		  AND start_at < $3 AND end_at > $2            -- เงื่อนไข "ช่วงเวลาทับกัน"
		  AND NOT (id = $4 AND user_id = $5)`,
		restID, from, to, excludeID, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Interval
	for rows.Next() {
		var iv Interval
		if err := rows.Scan(&iv.Start, &iv.End, &iv.Party); err != nil {
			return nil, err
		}
		list = append(list, iv)
	}
	return list, rows.Err()
}

func (a *App) dayAvailability(ctx context.Context, rs *restaurant, day time.Time, excludeID, uid int64) (availabilityJSON, error) {
	h := rs.hours()
	res := availabilityJSON{
		Date: day.Format("2006-01-02"), Seats: rs.Seats,
		Open: formatHM(h.OpenMin), Close: formatHM(h.CloseMin),
		LimitedThreshold: int(math.Ceil(float64(rs.Seats*rs.LimitedPct) / 100)),
		Slots:            []Slot{},
	}
	if h.ClosedOn(day.Weekday()) {
		res.Closed = true
		return res, nil
	}
	from, to := dayAt(day, h.OpenMin), dayAt(day, h.CloseEff())
	bs, err := overlapping(ctx, a.db, rs.ID, from, to, excludeID, uid)
	if err != nil {
		return res, err
	}
	res.Slots = BuildSlots(h, day, rs.Seats, bs, a.now())
	return res, nil
}

func (a *App) parseDay(s string) (time.Time, error) {
	if s == "" {
		n := a.now().In(a.loc)
		return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, a.loc), nil
	}
	d, err := time.ParseInLocation("2006-01-02", s, a.loc)
	if err != nil {
		return time.Time{}, errf(http.StatusBadRequest, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
	}
	return d, nil
}

// GET /api/restaurants/{id}/availability?date=YYYY-MM-DD&exclude=<bookingID>
func (a *App) handleAvailability(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	day, err := a.parseDay(r.URL.Query().Get("date"))
	if err != nil {
		writeError(w, err)
		return
	}
	viewer, err := a.currentUser(r)
	if err != nil {
		writeError(w, err)
		return
	}
	exclude, _ := strconv.ParseInt(r.URL.Query().Get("exclude"), 10, 64)
	rs, err := loadRestaurant(r.Context(), a.db, id, false)
	if err != nil {
		writeError(w, err)
		return
	}
	res, err := a.dayAvailability(r.Context(), rs, day, exclude, userID(viewer))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// ---------- จอง / แก้ไข ----------

type bookingInput struct {
	RestaurantID int64  `json:"restaurant_id"`
	Date         string `json:"date"`  // วันทำการ YYYY-MM-DD
	Start        string `json:"start"` // HH:MM
	End          string `json:"end"`   // HH:MM
	Party        int    `json:"party"`
}

// saveBooking ใช้ทั้งจองใหม่ (editID = 0) และแก้ไข เพราะโจทย์ให้ใช้กติกาเดียวกัน
//
// ทำทั้งหมดใน transaction เดียว และล็อกแถวร้านด้วย SELECT ... FOR UPDATE
// ถ้าสองคนกดจองร้านเดียวกันพร้อมกัน คนที่สองจะรอจนคนแรก commit
// แล้วจึงอ่านการจองล่าสุด (รวมของคนแรก) มาตรวจ จึงไม่มีทางจองเกินที่นั่ง
func (a *App) saveBooking(ctx context.Context, u *User, in bookingInput, editID int64) (int64, error) {
	if in.Party < 1 {
		return 0, errf(http.StatusBadRequest, "จำนวนคนต้องมากกว่า 0")
	}
	day, err := a.parseDay(in.Date)
	if err != nil || in.Date == "" {
		return 0, errf(http.StatusBadRequest, "กรุณาเลือกวันที่ (YYYY-MM-DD)")
	}

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() // ถ้า Commit สำเร็จแล้ว Rollback จะไม่มีผล

	restID := in.RestaurantID
	if editID != 0 {
		// แก้ไข: ร้านต้องเป็นร้านเดิมของการจองนี้เสมอ
		err := tx.QueryRowContext(ctx, `SELECT restaurant_id FROM bookings WHERE id = $1 AND user_id = $2`,
			editID, u.ID).Scan(&restID)
		if errors.Is(err, sql.ErrNoRows) {
			return 0, errf(http.StatusNotFound, "ไม่พบการจองนี้")
		}
		if err != nil {
			return 0, err
		}
	}

	// 1) ล็อกร้าน: คำขอจองร้านนี้ที่มาพร้อมกันต้องต่อคิวตรงนี้
	rs, err := loadRestaurant(ctx, tx, restID, true)
	if err != nil {
		return 0, err
	}
	if rs.OwnerID == u.ID {
		return 0, errf(http.StatusForbidden, "จองร้านของตัวเองไม่ได้")
	}
	now := a.now()

	if editID != 0 {
		var status string
		var oldStart time.Time
		if err := tx.QueryRowContext(ctx, `SELECT status, start_at FROM bookings WHERE id = $1 FOR UPDATE`,
			editID).Scan(&status, &oldStart); err != nil {
			return 0, err
		}
		if status != "confirmed" {
			return 0, errf(http.StatusUnprocessableEntity, "การจองนี้ถูกยกเลิกไปแล้ว")
		}
		if !CanModify(oldStart, rs.CancelMinutes, now) {
			return 0, errf(http.StatusUnprocessableEntity, "เลยเวลาที่แก้ไขได้แล้ว (ต้องแก้ไขก่อน %s)",
				CancelDeadline(oldStart, rs.CancelMinutes).In(a.loc).Format("15:04"))
		}
	}

	// 2) อยู่ในเวลาเปิดร้าน
	start, end, err := ResolveBooking(rs.hours(), day, in.Start, in.End)
	if err != nil {
		return 0, err
	}
	// 3) ไม่ใช่เวลาที่ผ่านไปแล้ว
	if !start.After(now) {
		return 0, errf(http.StatusUnprocessableEntity, "เวลาที่เลือกผ่านไปแล้ว")
	}
	// 4) ที่นั่งไม่เกิน ไม่ว่าจะเป็นนาทีไหนในช่วงที่จอง
	if in.Party > rs.Seats {
		return 0, errf(http.StatusConflict, "ร้านนี้มีทั้งหมด %d ที่นั่ง", rs.Seats)
	}
	others, err := overlapping(ctx, tx, rs.ID, start, end, editID, u.ID)
	if err != nil {
		return 0, err
	}
	peak := PeakOccupancy(others, start, end)
	if peak+in.Party > rs.Seats {
		return 0, errf(http.StatusConflict,
			"ที่นั่งไม่พอในช่วงเวลานี้ ช่วงที่แน่นที่สุดเหลือ %d ที่ แต่ต้องการ %d ที่",
			max(rs.Seats-peak, 0), in.Party)
	}

	id := editID
	if editID == 0 {
		err = tx.QueryRowContext(ctx, `
			INSERT INTO bookings (restaurant_id, user_id, party, start_at, end_at)
			VALUES ($1, $2, $3, $4, $5) RETURNING id`, rs.ID, u.ID, in.Party, start, end).Scan(&id)
	} else {
		_, err = tx.ExecContext(ctx, `
			UPDATE bookings SET party = $2, start_at = $3, end_at = $4, updated_at = now()
			WHERE id = $1`, editID, in.Party, start, end)
	}
	if err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

// POST /api/bookings
func (a *App) handleCreateBooking(w http.ResponseWriter, r *http.Request, u *User) {
	var in bookingInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	id, err := a.saveBooking(r.Context(), u, in, 0)
	if err != nil {
		writeError(w, err)
		return
	}
	b, err := a.findBooking(r.Context(), u.ID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, b)
}

// PUT /api/bookings/{id}
func (a *App) handleUpdateBooking(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var in bookingInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	if _, err := a.saveBooking(r.Context(), u, in, id); err != nil {
		writeError(w, err)
		return
	}
	b, err := a.findBooking(r.Context(), u.ID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// DELETE /api/bookings/{id} — ยกเลิก (เปลี่ยนสถานะ ไม่ลบทิ้ง เพื่อเก็บประวัติ)
func (a *App) handleCancelBooking(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
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

	var status string
	var start time.Time
	var cancelMin int
	err = tx.QueryRowContext(ctx, `
		SELECT b.status, b.start_at, r.cancel_minutes
		FROM bookings b JOIN restaurants r ON r.id = b.restaurant_id
		WHERE b.id = $1 AND b.user_id = $2
		FOR UPDATE OF b`, id, u.ID).Scan(&status, &start, &cancelMin)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, errf(http.StatusNotFound, "ไม่พบการจองนี้"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if status != "confirmed" {
		writeError(w, errf(http.StatusUnprocessableEntity, "การจองนี้ถูกยกเลิกไปแล้ว"))
		return
	}
	if !CanModify(start, cancelMin, a.now()) {
		writeError(w, errf(http.StatusUnprocessableEntity,
			"ยกเลิกได้ถึง %s เท่านั้น (ร้านกำหนดให้ยกเลิกล่วงหน้า %d นาที)",
			CancelDeadline(start, cancelMin).In(a.loc).Format("15:04"), cancelMin))
		return
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1`, id); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- การจองของฉัน ----------

type bookingJSON struct {
	ID             int64     `json:"id"`
	RestaurantID   int64     `json:"restaurant_id"`
	RestaurantName string    `json:"restaurant_name"`
	Party          int       `json:"party"`
	Status         string    `json:"status"`
	Date           string    `json:"date"`  // วันทำการ
	Start          string    `json:"start"` // HH:MM เวลาไทย
	End            string    `json:"end"`
	StartAt        time.Time `json:"start_at"`
	EndAt          time.Time `json:"end_at"`
	CancelMinutes  int       `json:"cancel_minutes"`
	CancelDeadline time.Time `json:"cancel_deadline"`
	CanModify      bool      `json:"can_modify"`
	IsPast         bool      `json:"is_past"`
}

func (a *App) listBookings(ctx context.Context, uid, onlyID int64) ([]bookingJSON, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT b.id, b.restaurant_id, r.name, b.party, b.status, b.start_at, b.end_at,
		       r.open_min, r.close_min, r.cancel_minutes
		FROM bookings b JOIN restaurants r ON r.id = b.restaurant_id
		WHERE b.user_id = $1 AND ($2 = 0 OR b.id = $2)
		ORDER BY b.start_at`, uid, onlyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := a.now()
	list := []bookingJSON{}
	for rows.Next() {
		var b bookingJSON
		var h Hours
		if err := rows.Scan(&b.ID, &b.RestaurantID, &b.RestaurantName, &b.Party, &b.Status,
			&b.StartAt, &b.EndAt, &h.OpenMin, &h.CloseMin, &b.CancelMinutes); err != nil {
			return nil, err
		}
		b.StartAt, b.EndAt = b.StartAt.In(a.loc), b.EndAt.In(a.loc)
		b.Date = BusinessDay(h, b.StartAt).Format("2006-01-02")
		b.Start, b.End = b.StartAt.Format("15:04"), b.EndAt.Format("15:04")
		b.CancelDeadline = CancelDeadline(b.StartAt, b.CancelMinutes)
		b.CanModify = b.Status == "confirmed" && CanModify(b.StartAt, b.CancelMinutes, now)
		b.IsPast = !b.StartAt.After(now)
		list = append(list, b)
	}
	return list, rows.Err()
}

func (a *App) findBooking(ctx context.Context, uid, id int64) (*bookingJSON, error) {
	list, err := a.listBookings(ctx, uid, id)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, errf(http.StatusNotFound, "ไม่พบการจองนี้")
	}
	return &list[0], nil
}

// GET /api/me/bookings
func (a *App) handleMyBookings(w http.ResponseWriter, r *http.Request, u *User) {
	list, err := a.listBookings(r.Context(), u.ID, 0)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/bookings/{id}
func (a *App) handleGetBooking(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	b, err := a.findBooking(r.Context(), u.ID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// ---------- เจ้าของร้านดูการจองของร้าน ----------

type ownerBookingJSON struct {
	ID        int64  `json:"id"`
	UserName  string `json:"user_name"`
	UserEmail string `json:"user_email"`
	Party     int    `json:"party"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Status    string `json:"status"`
}

type ownerDayJSON struct {
	availabilityJSON
	Bookings []ownerBookingJSON `json:"bookings"`
}

// GET /api/restaurants/{id}/bookings?date=YYYY-MM-DD (เฉพาะเจ้าของร้าน)
func (a *App) handleRestaurantBookings(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	ctx := r.Context()
	rs, err := loadRestaurant(ctx, a.db, id, false)
	if err != nil {
		writeError(w, err)
		return
	}
	if rs.OwnerID != u.ID {
		writeError(w, errf(http.StatusForbidden, "ดูการจองได้เฉพาะร้านของตัวเอง"))
		return
	}
	day, err := a.parseDay(r.URL.Query().Get("date"))
	if err != nil {
		writeError(w, err)
		return
	}
	avail, err := a.dayAvailability(ctx, rs, day, 0, 0)
	if err != nil {
		writeError(w, err)
		return
	}
	h := rs.hours()
	rows, err := a.db.QueryContext(ctx, `
		SELECT b.id, u.name, u.email, b.party, b.start_at, b.end_at, b.status
		FROM bookings b JOIN users u ON u.id = b.user_id
		WHERE b.restaurant_id = $1 AND b.start_at < $3 AND b.end_at > $2
		ORDER BY b.status, b.start_at`, id, dayAt(day, h.OpenMin), dayAt(day, h.CloseEff()))
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	res := ownerDayJSON{availabilityJSON: avail, Bookings: []ownerBookingJSON{}}
	for rows.Next() {
		var b ownerBookingJSON
		var s, e time.Time
		if err := rows.Scan(&b.ID, &b.UserName, &b.UserEmail, &b.Party, &s, &e, &b.Status); err != nil {
			writeError(w, err)
			return
		}
		b.Start, b.End = s.In(a.loc).Format("15:04"), e.In(a.loc).Format("15:04")
		res.Bookings = append(res.Bookings, b)
	}
	writeJSON(w, http.StatusOK, res)
}

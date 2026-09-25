package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

type reviewInput struct {
	Rating  int    `json:"rating"`
	Comment string `json:"comment"`
}

// POST /api/restaurants/{id}/reviews
// 1 คนรีวิวร้านหนึ่งได้ 1 ครั้ง ส่งซ้ำ = แก้รีวิวเดิม
// อัปเดต rating_sum / rating_count ใน transaction เดียวกับตัวรีวิว ค่าเฉลี่ยจึงตรงกับรีวิวจริงเสมอ
func (a *App) handleCreateReview(w http.ResponseWriter, r *http.Request, u *User) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var in reviewInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, errf(http.StatusBadRequest, "คะแนนต้องเป็นจำนวนเต็ม 1–5"))
		return
	}
	in.Comment = strings.TrimSpace(in.Comment)
	if in.Rating < 1 || in.Rating > 5 {
		writeError(w, errf(http.StatusBadRequest, "คะแนนต้องเป็นจำนวนเต็ม 1–5"))
		return
	}
	if utf8.RuneCountInString(in.Comment) > 1000 {
		writeError(w, errf(http.StatusBadRequest, "ข้อความรีวิวยาวเกิน 1000 ตัวอักษร"))
		return
	}

	ctx := r.Context()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()
	rs, err := loadRestaurant(ctx, tx, id, true)
	if err != nil {
		writeError(w, err)
		return
	}
	if rs.OwnerID == u.ID {
		writeError(w, errf(http.StatusForbidden, "รีวิวร้านของตัวเองไม่ได้"))
		return
	}

	var old int
	err = tx.QueryRowContext(ctx, `SELECT rating FROM reviews WHERE restaurant_id = $1 AND user_id = $2`,
		id, u.ID).Scan(&old)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		_, err = tx.ExecContext(ctx,
			`INSERT INTO reviews (restaurant_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)`,
			id, u.ID, in.Rating, in.Comment)
		if err == nil {
			_, err = tx.ExecContext(ctx,
				`UPDATE restaurants SET rating_sum = rating_sum + $2, rating_count = rating_count + 1 WHERE id = $1`,
				id, in.Rating)
		}
	case err == nil:
		_, err = tx.ExecContext(ctx,
			`UPDATE reviews SET rating = $3, comment = $4, updated_at = now() WHERE restaurant_id = $1 AND user_id = $2`,
			id, u.ID, in.Rating, in.Comment)
		if err == nil {
			_, err = tx.ExecContext(ctx,
				`UPDATE restaurants SET rating_sum = rating_sum + $2 - $3 WHERE id = $1`, id, in.Rating, old)
		}
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
	writeJSON(w, http.StatusCreated, detail)
}

var imageExt = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// POST /api/uploads (multipart field "file") → {"url": "/uploads/xxxx.jpg"}
// ตรวจชนิดไฟล์จากเนื้อไฟล์จริง ไม่เชื่อนามสกุลที่ผู้ใช้ตั้ง
func (a *App) handleUpload(w http.ResponseWriter, r *http.Request, u *User) {
	r.Body = http.MaxBytesReader(w, r.Body, 5<<20)
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, errf(http.StatusBadRequest, "ไม่พบไฟล์ หรือไฟล์ใหญ่เกิน 5 MB"))
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		writeError(w, errf(http.StatusBadRequest, "อ่านไฟล์ไม่ได้"))
		return
	}
	ext, ok := imageExt[http.DetectContentType(head[:n])]
	if !ok {
		writeError(w, errf(http.StatusUnprocessableEntity, "รองรับเฉพาะรูป JPG, PNG, WEBP หรือ GIF"))
		return
	}

	name := make([]byte, 16)
	if _, err := rand.Read(name); err != nil {
		writeError(w, err)
		return
	}
	filename := hex.EncodeToString(name) + ext
	dst, err := os.Create(filepath.Join(a.uploadDir, filename))
	if err != nil {
		writeError(w, err)
		return
	}
	defer dst.Close()
	if _, err := dst.Write(head[:n]); err == nil {
		_, err = io.Copy(dst, file)
	}
	if err != nil {
		writeError(w, errf(http.StatusBadRequest, "อัปโหลดไม่สำเร็จ หรือไฟล์ใหญ่เกิน 5 MB"))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"url": "/uploads/" + filename})
}

package main

import (
	"context"
	"fmt"
	"log"
	"time"
)

// keycloak_sub คงที่สำหรับบัญชีตัวอย่าง ต้องตรงกับ id ของ user ใน keycloak/tablebook-realm.json
// เพื่อให้ login ผ่าน Keycloak แล้ว JIT-provision ไปจับคู่กับ user (และร้าน/รีวิว/การจอง) ที่ seed ไว้ตรงนี้ได้เลย
const (
	subCustomer = "00000000-0000-0000-0000-000000000001"
	subOwner    = "00000000-0000-0000-0000-000000000002"
	subOwner2   = "00000000-0000-0000-0000-000000000003"
)

var subReviewers = []string{
	"00000000-0000-0000-0000-000000000004",
	"00000000-0000-0000-0000-000000000005",
	"00000000-0000-0000-0000-000000000006",
	"00000000-0000-0000-0000-000000000007",
	"00000000-0000-0000-0000-000000000008",
	"00000000-0000-0000-0000-000000000009",
	"00000000-0000-0000-0000-00000000000a",
	"00000000-0000-0000-0000-00000000000b",
	"00000000-0000-0000-0000-00000000000c",
	"00000000-0000-0000-0000-00000000000d",
	"00000000-0000-0000-0000-00000000000e",
	"00000000-0000-0000-0000-00000000000f",
}

// seedIfEmpty ใส่ข้อมูลตัวอย่างเมื่อฐานข้อมูลยังว่าง (เปิดครั้งแรกก็เห็นร้านและการจองทันที)
// การจองตัวอย่างอิงจาก "พรุ่งนี้" ตามเวลาไทย จึงไม่กลายเป็นอดีตไม่ว่าจะรันวันไหน
func (a *App) seedIfEmpty(ctx context.Context) error {
	var n int
	if err := a.db.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	log.Println("ฐานข้อมูลว่าง กำลังใส่ข้อมูลตัวอย่าง...")

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	addUser := func(sub, email, name string) int64 {
		var id int64
		if err == nil {
			err = tx.QueryRowContext(ctx,
				`INSERT INTO users (keycloak_sub, email, name) VALUES ($1, $2, $3) RETURNING id`,
				sub, email, name).Scan(&id)
		}
		return id
	}
	customer := addUser(subCustomer, "customer@example.com", "สมชาย ใจดี")
	owner := addUser(subOwner, "owner@example.com", "ป้าแดง")
	owner2 := addUser(subOwner2, "owner2@example.com", "เจ๊นก")
	names := []string{"นภา", "ธีร์", "มายด์", "ก้อง", "แพร", "บอส", "ฝน", "ต้น", "เมย์", "โอ๊ต", "จูน", "ปั้น"}
	reviewers := make([]int64, len(names))
	for i, nm := range names {
		reviewers[i] = addUser(subReviewers[i], fmt.Sprintf("reviewer%02d@example.com", i+1), nm)
	}
	if err != nil {
		return err
	}

	comments := []string{
		"อาหารอร่อย บริการดี จะกลับมาอีก", "บรรยากาศดีมาก เหมาะกับมากันหลายคน",
		"รสชาติจัดจ้าน ถูกใจ", "จองแล้วได้โต๊ะตรงเวลา ไม่ต้องรอ", "ราคาเป็นกันเอง ปริมาณเยอะ",
		"คนเยอะช่วงเที่ยง แนะนำให้จองก่อน",
	}
	type seedRest struct {
		owner                                int64
		name, desc, cuisine, location, image string
		seats, open, close, closed, cancel   int
		ratings                              []int
	}
	rests := []seedRest{
		{owner2, "ครัวริมคลอง", "อาหารไทยพื้นบ้าน นั่งริมน้ำ ลมเย็นสบาย", "อาหารไทยพื้นบ้าน", "บางกอกน้อย", "krua.svg",
			10, 600, 1320, 0, 30, []int{5, 5, 5, 5, 5, 4, 5, 5, 4, 5}},
		{owner2, "ส้มตำหน้าตลาด", "ส้มตำ ไก่ย่าง ลาบ รสชาติอีสานแท้", "อาหารอีสาน", "ตลาดพลู", "somtam.svg",
			24, 600, 1260, 0, 120, []int{5, 4, 5, 5, 4, 5, 4, 5, 5, 4, 5, 4}},
		{owner2, "ก๋วยเตี๋ยวเรือหน้าวัด", "ก๋วยเตี๋ยวเรือน้ำตก หยุดทุกวันจันทร์", "ก๋วยเตี๋ยว", "รังสิต", "boat.svg",
			16, 480, 960, 1 << int(time.Monday), 30, []int{4, 5, 4, 4, 5, 4}},
		{owner, "บาร์ปากซอย", "ร้านนั่งชิล เปิดข้ามเที่ยงคืน", "ร้านนั่งชิล", "อารีย์", "bar.svg",
			12, 1080, 120, 0, 60, []int{5}},
		{owner, "ข้าวแกงป้าแดง", "ข้าวราดแกงสูตรบ้าน กว่า 20 อย่าง", "ข้าวราดแกง", "สามย่าน", "khaogaeng.svg",
			20, 600, 1320, 0, 30, []int{5, 4, 5, 4, 5, 4, 5, 4}},
		{owner2, "ซีฟู้ดท่าเรือ", "อาหารทะเลสดจากเรือประมง", "อาหารทะเล", "บางแสน", "seafood.svg",
			40, 660, 1320, 0, 30, []int{5, 5, 4, 5, 5, 4, 5}},
	}
	ids := make([]int64, len(rests))
	for i, s := range rests {
		sum := 0
		for _, v := range s.ratings {
			sum += v
		}
		err = tx.QueryRowContext(ctx, `
			INSERT INTO restaurants (owner_id, name, description, cuisine, location, seats, open_min, close_min,
				closed_days, cancel_minutes, rating_sum, rating_count)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
			s.owner, s.name, s.desc, s.cuisine, s.location, s.seats, s.open, s.close,
			s.closed, s.cancel, sum, len(s.ratings)).Scan(&ids[i])
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx,
			`INSERT INTO restaurant_images (restaurant_id, url, position) VALUES ($1, $2, 0)`,
			ids[i], "/uploads/seed/"+s.image); err != nil {
			return err
		}
		for j, v := range s.ratings {
			if _, err = tx.ExecContext(ctx,
				`INSERT INTO reviews (restaurant_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)`,
				ids[i], reviewers[j], v, comments[(i+j)%len(comments)]); err != nil {
				return err
			}
		}
	}

	now := a.now().In(a.loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, a.loc)
	book := func(restIdx int, user int64, dayOffset int, start, end string, party int) {
		if err != nil {
			return
		}
		s := rests[restIdx]
		day := today.AddDate(0, 0, dayOffset)
		h := Hours{OpenMin: s.open, CloseMin: s.close, ClosedDays: s.closed}
		var st, en time.Time
		st, en, err = ResolveBooking(h, day, start, end)
		if err != nil {
			err = fmt.Errorf("seed booking %s %s: %w", s.name, start, err)
			return
		}
		_, err = tx.ExecContext(ctx,
			`INSERT INTO bookings (restaurant_id, user_id, party, start_at, end_at) VALUES ($1,$2,$3,$4,$5)`,
			ids[restIdx], user, party, st, en)
	}
	// ครัวริมคลอง พรุ่งนี้: เหมือนตัวอย่างในโจทย์ (A 7 คน 12:00-12:30, B 7 คน 12:30-13:00)
	// ลองจอง 3 คน 12:00-13:00 จะผ่าน แต่ 4 คนจะไม่ผ่าน
	book(0, reviewers[0], 1, "12:00", "12:30", 7)
	book(0, reviewers[1], 1, "12:30", "13:00", 7)
	book(0, customer, 1, "18:00", "19:30", 2)
	// ส้มตำหน้าตลาด (ยกเลิกล่วงหน้า 2 ชม.)
	book(1, customer, 2, "19:00", "20:00", 4)
	book(1, reviewers[2], 1, "12:00", "13:30", 20)
	// ข้าวแกงป้าแดง (ร้านของ owner): ช่วงเที่ยงพรุ่งนี้เหลือ 3 ที่ → ขึ้น Limited Seats
	book(4, customer, 1, "12:00", "13:00", 5)
	book(4, reviewers[3], 1, "12:00", "13:30", 12)
	book(4, reviewers[4], 1, "18:30", "20:00", 6)
	book(4, reviewers[5], 2, "12:00", "13:00", 8)
	// บาร์ปากซอย (ร้านข้ามคืน)
	book(3, reviewers[6], 1, "23:00", "01:00", 6)
	book(3, customer, 3, "20:00", "22:00", 3)
	if err != nil {
		return err
	}
	return tx.Commit()
}

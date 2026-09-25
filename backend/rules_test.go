package main

import (
	"testing"
	"time"
)

var bkk, _ = time.LoadLocation("Asia/Bangkok")

func at(day, hm string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", day+" "+hm, bkk)
	if err != nil {
		panic(err)
	}
	return t
}

// ตัวอย่างจากสไลด์ 7 ของโจทย์
func TestPeakOccupancy_SlideExamples(t *testing.T) {
	d := "2026-10-11"

	// ซ้าย: จองแล้ว 7 คน 12:00-13:00 แล้วมีคนขอ 5 คน 12:30-13:00 → 12 เกิน 10
	existing := []Interval{{at(d, "12:00"), at(d, "13:00"), 7}}
	if got := PeakOccupancy(existing, at(d, "12:30"), at(d, "13:00")); got+5 <= 10 {
		t.Fatalf("ควรจองไม่ได้ peak=%d", got)
	}

	// ขวา: A 7 คน 12:00-12:30, B 7 คน 12:30-13:00, C ขอ 3 คน 12:00-13:00
	// A+B+C = 17 แต่ไม่มีช่วงไหนเกิน 10 → ต้องจองได้
	ab := []Interval{
		{at(d, "12:00"), at(d, "12:30"), 7},
		{at(d, "12:30"), at(d, "13:00"), 7},
	}
	peak := PeakOccupancy(ab, at(d, "12:00"), at(d, "13:00"))
	if peak != 7 {
		t.Fatalf("peak ควรเป็น 7 (A ลุกพอดีตอน B มา) ได้ %d", peak)
	}
	if peak+3 > 10 {
		t.Fatal("C 3 คน ต้องจองได้")
	}
	if peak+4 <= 10 {
		t.Fatal("C 4 คน ต้องจองไม่ได้")
	}
}

// สไลด์ 8: ร้าน 10 ที่ A จอง 7 B จอง 3 เวลาเดียวกัน A แก้เป็น 8 ไม่ได้ แก้เป็น 5 ได้
// (ตอนแก้ ไม่นับที่นั่งเดิมของ A ซ้ำ จึงเหลือแค่ B)
func TestEditDoesNotDoubleCount(t *testing.T) {
	d := "2026-10-11"
	onlyB := []Interval{{at(d, "12:00"), at(d, "13:00"), 3}}
	peak := PeakOccupancy(onlyB, at(d, "12:00"), at(d, "13:00"))
	if peak+8 <= 10 {
		t.Fatal("A แก้เป็น 8 ต้องไม่ผ่าน")
	}
	if peak+5 > 10 {
		t.Fatal("A แก้เป็น 5 ต้องผ่าน")
	}
}

func TestResolveBooking_Overnight(t *testing.T) {
	h := Hours{OpenMin: 18 * 60, CloseMin: 2 * 60} // 18:00-02:00
	day := at("2026-10-16", "00:00")               // วันศุกร์

	s, e, err := ResolveBooking(h, day, "23:30", "01:00")
	if err != nil {
		t.Fatal(err)
	}
	if !s.Equal(at("2026-10-16", "23:30")) || !e.Equal(at("2026-10-17", "01:00")) {
		t.Fatalf("ได้ %v - %v", s, e)
	}

	s, _, err = ResolveBooking(h, day, "00:30", "02:00")
	if err != nil || !s.Equal(at("2026-10-17", "00:30")) {
		t.Fatalf("00:30 ต้องเป็นหลังเที่ยงคืนของคืนวันศุกร์: %v %v", s, err)
	}

	if _, _, err := ResolveBooking(h, day, "01:30", "03:00"); err == nil {
		t.Fatal("เกินเวลาปิด 02:00 ต้อง error")
	}
	if _, _, err := ResolveBooking(h, day, "17:00", "19:00"); err == nil {
		t.Fatal("ก่อนร้านเปิด ต้อง error")
	}
	if got := BusinessDay(h, at("2026-10-17", "00:30")); got.Day() != 16 {
		t.Fatalf("วันทำการของ 00:30 ต้องเป็นวันที่ 16 ได้ %d", got.Day())
	}
}

func TestResolveBooking_NormalAndClosedDay(t *testing.T) {
	h := Hours{OpenMin: 10 * 60, CloseMin: 22 * 60, ClosedDays: 1 << int(time.Monday)}
	sunday := at("2026-10-11", "00:00")
	if _, _, err := ResolveBooking(h, sunday, "21:30", "22:30"); err == nil {
		t.Fatal("เลยเวลาปิด ต้อง error")
	}
	if _, _, err := ResolveBooking(h, sunday, "13:00", "12:00"); err == nil {
		t.Fatal("เวลาสิ้นสุดก่อนเวลาเริ่ม ต้อง error")
	}
	monday := at("2026-10-12", "00:00")
	if _, _, err := ResolveBooking(h, monday, "12:00", "13:00"); err == nil {
		t.Fatal("วันหยุด ต้อง error")
	}
}

func TestCanModify(t *testing.T) {
	start := at("2026-10-11", "12:00")
	if !CanModify(start, 30, at("2026-10-11", "11:29")) {
		t.Fatal("11:29 ยังยกเลิกได้")
	}
	if CanModify(start, 30, at("2026-10-11", "11:30")) {
		t.Fatal("11:30 ต้องยกเลิกไม่ได้แล้ว")
	}
	if CanModify(start, 120, at("2026-10-11", "10:30")) {
		t.Fatal("ร้านตั้ง 2 ชม. 10:30 ต้องยกเลิกไม่ได้")
	}
}

func TestPassword(t *testing.T) {
	h, err := hashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if !checkPassword("password123", h) || checkPassword("wrong", h) {
		t.Fatal("ตรวจรหัสผ่านผิด")
	}
}

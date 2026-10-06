package main

import (
	"net/http"
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

func TestCancelDeadline(t *testing.T) {
	start := at("2026-10-11", "12:00")
	got := CancelDeadline(start, 90)
	want := at("2026-10-11", "10:30")
	if !got.Equal(want) {
		t.Fatalf("deadline ควรเป็น %v ได้ %v", want, got)
	}
}

func TestHoursOvernightAndCloseEff(t *testing.T) {
	normal := Hours{OpenMin: 10 * 60, CloseMin: 22 * 60}
	if normal.Overnight() {
		t.Fatal("ร้าน 10:00-22:00 ไม่ใช่ข้ามคืน")
	}
	if normal.CloseEff() != 22*60 {
		t.Fatalf("CloseEff ของร้านปกติต้องเท่ากับ CloseMin ได้ %d", normal.CloseEff())
	}

	overnight := Hours{OpenMin: 18 * 60, CloseMin: 2 * 60}
	if !overnight.Overnight() {
		t.Fatal("ร้าน 18:00-02:00 ต้องนับเป็นข้ามคืน")
	}
	if want := 2*60 + 24*60; overnight.CloseEff() != want {
		t.Fatalf("CloseEff ของร้านข้ามคืนควรเป็น %d ได้ %d", want, overnight.CloseEff())
	}

	// ปิด-เปิดเวลาเดียวกัน (เช่น 00:00-00:00) ถือเป็นข้ามคืนด้วยตามเงื่อนไข CloseMin <= OpenMin
	same := Hours{OpenMin: 9 * 60, CloseMin: 9 * 60}
	if !same.Overnight() {
		t.Fatal("เปิด-ปิดเวลาเดียวกันต้องถือเป็นข้ามคืน (เปิด 24 ชม. ของวันถัดไป)")
	}
}

func TestClosedOn(t *testing.T) {
	h := Hours{ClosedDays: (1 << uint(time.Sunday)) | (1 << uint(time.Monday))}
	if !h.ClosedOn(time.Sunday) || !h.ClosedOn(time.Monday) {
		t.Fatal("อาทิตย์กับจันทร์ต้องปิด")
	}
	for _, d := range []time.Weekday{time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday} {
		if h.ClosedOn(d) {
			t.Fatalf("%v ไม่ควรปิด", d)
		}
	}
}

func TestResolveBooking_InvalidTimeFormat(t *testing.T) {
	h := Hours{OpenMin: 10 * 60, CloseMin: 22 * 60}
	day := at("2026-10-11", "00:00")

	if _, _, err := ResolveBooking(h, day, "25:00", "13:00"); err == nil {
		t.Fatal("เวลาเริ่มรูปแบบผิด ต้อง error")
	} else if ae, ok := err.(*apiError); !ok || ae.Status != http.StatusBadRequest {
		t.Fatalf("ต้องเป็น 400 Bad Request ได้ %v", err)
	}

	if _, _, err := ResolveBooking(h, day, "12:00", "bad"); err == nil {
		t.Fatal("เวลาสิ้นสุดรูปแบบผิด ต้อง error")
	} else if ae, ok := err.(*apiError); !ok || ae.Status != http.StatusBadRequest {
		t.Fatalf("ต้องเป็น 400 Bad Request ได้ %v", err)
	}
}

func TestResolveBooking_OutOfHoursIsUnprocessable(t *testing.T) {
	h := Hours{OpenMin: 10 * 60, CloseMin: 22 * 60}
	day := at("2026-10-11", "00:00")
	_, _, err := ResolveBooking(h, day, "21:30", "22:30")
	if err == nil {
		t.Fatal("เลยเวลาปิด ต้อง error")
	}
	if ae, ok := err.(*apiError); !ok || ae.Status != http.StatusUnprocessableEntity {
		t.Fatalf("ต้องเป็น 422 Unprocessable Entity ได้ %v", err)
	}
}

func TestBusinessDay_NormalHours(t *testing.T) {
	h := Hours{OpenMin: 10 * 60, CloseMin: 22 * 60}
	// ร้านปกติไม่ข้ามคืน วันทำการต้องตรงกับวันปฏิทินเสมอ ไม่ว่าจะจองช่วงไหนของวัน
	if got := BusinessDay(h, at("2026-10-11", "10:30")); got.Day() != 11 {
		t.Fatalf("ได้วันที่ %d", got.Day())
	}
	if got := BusinessDay(h, at("2026-10-11", "21:59")); got.Day() != 11 {
		t.Fatalf("ได้วันที่ %d", got.Day())
	}
}

func TestPeakOccupancy_EmptyAndClipping(t *testing.T) {
	d := "2026-10-11"
	if got := PeakOccupancy(nil, at(d, "12:00"), at(d, "13:00")); got != 0 {
		t.Fatalf("ไม่มีการจองเลย peak ต้องเป็น 0 ได้ %d", got)
	}

	// การจองที่ยื่นออกไปนอกช่วง [from, to) ต้องถูกตัดให้เหลือแค่ส่วนที่ทับ
	bookings := []Interval{{at(d, "11:00"), at(d, "14:00"), 6}}
	if got := PeakOccupancy(bookings, at(d, "12:00"), at(d, "13:00")); got != 6 {
		t.Fatalf("ช่วงที่ทับควรนับเต็ม 6 ได้ %d", got)
	}

	// การจองที่ไม่ทับช่วงที่สนใจเลย ต้องไม่ถูกนับ
	outside := []Interval{{at(d, "08:00"), at(d, "09:00"), 10}}
	if got := PeakOccupancy(outside, at(d, "12:00"), at(d, "13:00")); got != 0 {
		t.Fatalf("การจองนอกช่วงไม่ควรถูกนับ ได้ %d", got)
	}
}

func TestBuildSlots(t *testing.T) {
	h := Hours{OpenMin: 12 * 60, CloseMin: 13 * 60} // เปิดแค่ 1 ชม. = 2 ช่วง 30 นาที
	d := "2026-10-11"
	day := at(d, "00:00")
	bookings := []Interval{{at(d, "12:00"), at(d, "12:30"), 4}}

	slots := BuildSlots(h, day, 10, bookings, at(d, "11:00"))
	if len(slots) != 2 {
		t.Fatalf("ร้านเปิด 1 ชม. ต้องได้ 2 ช่วงละ 30 นาที ได้ %d", len(slots))
	}

	first := slots[0]
	if first.Start != "12:00" || first.End != "12:30" {
		t.Fatalf("ช่วงแรกควรเป็น 12:00-12:30 ได้ %s-%s", first.Start, first.End)
	}
	if first.Used != 4 || first.Remaining != 6 {
		t.Fatalf("ช่วงแรกใช้ไป 4 เหลือ 6 ได้ used=%d remaining=%d", first.Used, first.Remaining)
	}
	if first.Past {
		t.Fatal("เวลาปัจจุบัน 11:00 ยังไม่ถึงช่วงแรก ไม่ควรเป็นอดีต")
	}

	second := slots[1]
	if second.Used != 0 || second.Remaining != 10 {
		t.Fatalf("ช่วงที่สองไม่มีการจอง ได้ used=%d remaining=%d", second.Used, second.Remaining)
	}

	// now อยู่หลังเวลาเริ่มของช่วงแรกแต่ยังไม่ถึงช่วงที่สอง (Past หมายถึง "เริ่มไปแล้ว" ไม่ใช่ "จบไปแล้ว")
	later := BuildSlots(h, day, 10, bookings, at(d, "12:15"))
	if !later[0].Past {
		t.Fatal("เวลาปัจจุบันผ่านเวลาเริ่มของช่วงแรกไปแล้ว ต้อง Past=true")
	}
	if later[1].Past {
		t.Fatal("ช่วงที่สองยังไม่เริ่ม ไม่ควร Past=true")
	}
}

func TestBuildSlots_RemainingNeverNegative(t *testing.T) {
	h := Hours{OpenMin: 12 * 60, CloseMin: 12*60 + 30}
	d := "2026-10-11"
	day := at(d, "00:00")
	// จองเกินที่นั่งไปแล้ว (เช่นแก้กติกาทีหลัง) remaining ต้องไม่ติดลบ
	bookings := []Interval{{at(d, "12:00"), at(d, "12:30"), 99}}
	slots := BuildSlots(h, day, 10, bookings, at(d, "00:00"))
	if len(slots) != 1 {
		t.Fatalf("ต้องได้ 1 ช่วง ได้ %d", len(slots))
	}
	if slots[0].Remaining != 0 {
		t.Fatalf("remaining ต้องไม่ติดลบ ได้ %d", slots[0].Remaining)
	}
}

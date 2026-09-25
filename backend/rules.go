package main

// ไฟล์นี้รวมกติกาการจองทั้งหมดเป็นฟังก์ชันล้วน (ไม่แตะ DB/HTTP)
// จึงเขียน unit test ได้ง่าย ดู rules_test.go

import (
	"fmt"
	"net/http"
	"sort"
	"time"
)

const slotMinutes = 30

// Hours คือเวลาเปิด-ปิดของร้าน หน่วยเป็นนาทีนับจากเที่ยงคืน
type Hours struct {
	OpenMin    int
	CloseMin   int
	ClosedDays int // bitmask: bit 0 = อาทิตย์ ... bit 6 = เสาร์
}

// Overnight = ร้านปิดข้ามเที่ยงคืน เช่น 18:00-02:00
func (h Hours) Overnight() bool { return h.CloseMin <= h.OpenMin }

// CloseEff คือเวลาปิดที่นับต่อจากวันเปิด เช่น ปิด 02:00 ของร้านข้ามคืน = 26:00 = 1560 นาที
func (h Hours) CloseEff() int {
	if h.Overnight() {
		return h.CloseMin + 24*60
	}
	return h.CloseMin
}

func (h Hours) ClosedOn(d time.Weekday) bool { return h.ClosedDays&(1<<uint(d)) != 0 }

func parseHM(s string) (int, error) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return 0, err
	}
	return t.Hour()*60 + t.Minute(), nil
}

func formatHM(min int) string {
	min = ((min % 1440) + 1440) % 1440
	return fmt.Sprintf("%02d:%02d", min/60, min%60)
}

// dayAt คืนเวลา "วัน day + min นาที" (min เกิน 1440 ได้ time.Date จะเลื่อนไปวันถัดไปให้เอง)
func dayAt(day time.Time, min int) time.Time {
	return time.Date(day.Year(), day.Month(), day.Day(), 0, min, 0, 0, day.Location())
}

// ResolveBooking แปลง "วันทำการ + เวลาเริ่ม/สิ้นสุด (HH:MM)" เป็นเวลาจริง แล้วตรวจว่าอยู่ในเวลาเปิดร้าน
//
// "วันทำการ" (business day) คือวันที่ร้านเปิด ร้าน 18:00-02:00 ของวันศุกร์
// ถ้าจอง 00:30-01:30 หมายถึงตี 0:30 ของคืนวันศุกร์ = เช้ามืดวันเสาร์
func ResolveBooking(h Hours, day time.Time, startHM, endHM string) (time.Time, time.Time, error) {
	s, err := parseHM(startHM)
	if err != nil {
		return time.Time{}, time.Time{}, errf(http.StatusBadRequest, "รูปแบบเวลาเริ่มไม่ถูกต้อง (HH:MM)")
	}
	e, err := parseHM(endHM)
	if err != nil {
		return time.Time{}, time.Time{}, errf(http.StatusBadRequest, "รูปแบบเวลาสิ้นสุดไม่ถูกต้อง (HH:MM)")
	}
	if h.ClosedOn(day.Weekday()) {
		return time.Time{}, time.Time{}, errf(http.StatusUnprocessableEntity, "ร้านปิดในวันที่เลือก")
	}
	if h.Overnight() && s < h.OpenMin {
		s += 24 * 60 // หลังเที่ยงคืน ของร้านที่เปิดข้ามคืน
	}
	if e <= s {
		e += 24 * 60
	}
	if s < h.OpenMin || e > h.CloseEff() {
		return time.Time{}, time.Time{}, errf(http.StatusUnprocessableEntity,
			"ต้องจองภายในเวลาเปิดร้าน %s–%s", formatHM(h.OpenMin), formatHM(h.CloseMin))
	}
	return dayAt(day, s), dayAt(day, e), nil
}

// BusinessDay ทำกลับด้าน: จากเวลาเริ่มจริง หาว่าเป็นการจองของ "วันทำการ" ไหน
func BusinessDay(h Hours, start time.Time) time.Time {
	day := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())
	if h.Overnight() && start.Hour()*60+start.Minute() < h.OpenMin {
		day = day.AddDate(0, 0, -1)
	}
	return day
}

// Interval คือการจองหนึ่งรายการ (ช่วงเวลา [Start, End) และจำนวนคน)
type Interval struct {
	Start, End time.Time
	Party      int
}

// PeakOccupancy หา "จำนวนคนที่นั่งพร้อมกันมากที่สุด" ในช่วง [from, to)
//
// ห้ามเอาทุกการจองที่ทับช่วงมาบวกกันตรง ๆ เช่นร้าน 10 ที่
// A 7 คน 12:00-12:30, B 7 คน 12:30-13:00 แล้ว C ขอ 3 คน 12:00-13:00
// ถ้าบวกตรง ๆ = 17 จะปฏิเสธผิด ๆ ทั้งที่ไม่มีช่วงไหนเกิน 10 เลย
//
// วิธีคือ sweep line: แปลงทุกการจองเป็นเหตุการณ์ "เข้า +คน" และ "ออก -คน"
// เรียงตามเวลา แล้วเดินบวกลบไปเรื่อย ๆ จำค่าสูงสุดไว้
func PeakOccupancy(bookings []Interval, from, to time.Time) int {
	type event struct {
		at    time.Time
		delta int
	}
	events := make([]event, 0, len(bookings)*2)
	for _, b := range bookings {
		s, e := b.Start, b.End
		if s.Before(from) {
			s = from
		}
		if e.After(to) {
			e = to
		}
		if s.Before(e) { // ทับกับช่วงที่สนใจจริง
			events = append(events, event{s, b.Party}, event{e, -b.Party})
		}
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].at.Equal(events[j].at) {
			// เวลาเท่ากัน ให้ "ออก" มาก่อน "เข้า" : A ลุก 12:30 พอดีกับ B มา 12:30 ต้องไม่นับซ้อน
			return events[i].delta < events[j].delta
		}
		return events[i].at.Before(events[j].at)
	})
	cur, peak := 0, 0
	for _, ev := range events {
		cur += ev.delta
		if cur > peak {
			peak = cur
		}
	}
	return peak
}

// CanModify: ยกเลิก/แก้ไขได้ถ้าตอนนี้ยังไม่ถึง (เวลาจอง - เวลายกเลิกล่วงหน้าของร้าน)
func CanModify(start time.Time, cancelMinutes int, now time.Time) bool {
	return now.Before(CancelDeadline(start, cancelMinutes))
}

func CancelDeadline(start time.Time, cancelMinutes int) time.Time {
	return start.Add(-time.Duration(cancelMinutes) * time.Minute)
}

// Slot คือช่วงละ 30 นาทีที่ส่งให้หน้าเว็บวาดกราฟและเลือกเวลา
type Slot struct {
	Start     string `json:"start"`
	End       string `json:"end"`
	Used      int    `json:"used"`
	Remaining int    `json:"remaining"`
	Past      bool   `json:"past"`
}

func BuildSlots(h Hours, day time.Time, seats int, bookings []Interval, now time.Time) []Slot {
	slots := []Slot{}
	for m := h.OpenMin; m+slotMinutes <= h.CloseEff(); m += slotMinutes {
		s, e := dayAt(day, m), dayAt(day, m+slotMinutes)
		used := PeakOccupancy(bookings, s, e)
		remaining := seats - used
		if remaining < 0 {
			remaining = 0
		}
		slots = append(slots, Slot{
			Start:     formatHM(m),
			End:       formatHM(m + slotMinutes),
			Used:      used,
			Remaining: remaining,
			Past:      !s.After(now),
		})
	}
	return slots
}

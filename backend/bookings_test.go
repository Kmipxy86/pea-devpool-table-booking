package main

import (
	"net/http"
	"testing"
	"time"
)

func TestParseDay_Explicit(t *testing.T) {
	a := &App{loc: bkk}
	d, err := a.parseDay("2026-10-11")
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if d.Year() != 2026 || d.Month() != time.October || d.Day() != 11 {
		t.Fatalf("parse วันที่ผิด ได้ %v", d)
	}
	if d.Location() != bkk {
		t.Fatal("ต้องใช้ location ของ App")
	}
}

func TestParseDay_EmptyUsesNow(t *testing.T) {
	fixed := at("2026-10-11", "15:30")
	a := &App{loc: bkk, now: func() time.Time { return fixed }}
	d, err := a.parseDay("")
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if d.Year() != 2026 || d.Month() != time.October || d.Day() != 11 {
		t.Fatalf("วันที่ว่างต้องใช้วันนี้จาก a.now() ได้ %v", d)
	}
	if d.Hour() != 0 || d.Minute() != 0 {
		t.Fatalf("ต้องถูกปัดลงเหลือแค่วัน (เที่ยงคืน) ได้ %v", d)
	}
}

func TestParseDay_InvalidFormat(t *testing.T) {
	a := &App{loc: bkk}
	_, err := a.parseDay("11/10/2026")
	if err == nil {
		t.Fatal("รูปแบบวันที่ผิด ต้อง error")
	}
	if ae, ok := err.(*apiError); !ok || ae.Status != http.StatusBadRequest {
		t.Fatalf("ต้องเป็น 400 Bad Request ได้ %v", err)
	}
}

package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]string{"hello": "world"})

	if w.Code != http.StatusCreated {
		t.Fatalf("status ควรเป็น 201 ได้ %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("content-type ผิด ได้ %q", ct)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body ไม่ได้: %v", err)
	}
	if body["hello"] != "world" {
		t.Fatalf("ได้ body %v", body)
	}
}

func TestWriteJSON_NilBody(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusNoContent, nil)
	if w.Body.Len() != 0 {
		t.Fatalf("v=nil ต้องไม่เขียน body ได้ %q", w.Body.String())
	}
}

func TestWriteError_APIError(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, errf(http.StatusForbidden, "ห้ามเข้า"))

	if w.Code != http.StatusForbidden {
		t.Fatalf("ต้องใช้ status จาก apiError ได้ %d", w.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body ไม่ได้: %v", err)
	}
	if body["error"] != "ห้ามเข้า" {
		t.Fatalf("ข้อความ error ต้องมาจาก apiError ตรง ๆ ได้ %v", body)
	}
}

func TestWriteError_GenericErrorHidesDetails(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, errors.New("connection refused: 10.0.0.1:5432"))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("error ที่ไม่ใช่ apiError ต้องตอบ 500 ได้ %d", w.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body ไม่ได้: %v", err)
	}
	if strings.Contains(body["error"], "10.0.0.1") {
		t.Fatal("ห้ามรั่วรายละเอียด error ภายในออกไปให้ผู้ใช้เห็น")
	}
}

func TestDecodeJSON_Valid(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"rating":5}`))
	w := httptest.NewRecorder()
	var in struct {
		Rating int `json:"rating"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if in.Rating != 5 {
		t.Fatalf("decode ผิด ได้ %d", in.Rating)
	}
}

func TestDecodeJSON_InvalidReturnsBadRequest(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`not json`))
	w := httptest.NewRecorder()
	var in map[string]any
	err := decodeJSON(w, r, &in)
	if err == nil {
		t.Fatal("JSON ผิดรูปแบบต้อง error")
	}
	ae, ok := err.(*apiError)
	if !ok || ae.Status != http.StatusBadRequest {
		t.Fatalf("ต้องเป็น 400 Bad Request ได้ %v", err)
	}
}

func TestPathID(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.SetPathValue("id", "42")
	id, err := pathID(r)
	if err != nil || id != 42 {
		t.Fatalf("ได้ id=%d err=%v", id, err)
	}
}

func TestPathID_InvalidOrNonPositive(t *testing.T) {
	cases := []string{"abc", "0", "-1", ""}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.SetPathValue("id", c)
		_, err := pathID(r)
		if err == nil {
			t.Fatalf("id=%q ต้อง error", c)
		}
		if ae, ok := err.(*apiError); !ok || ae.Status != http.StatusNotFound {
			t.Fatalf("id=%q ต้องเป็น 404 ได้ %v", c, err)
		}
	}
}

func TestStatusRecorder(t *testing.T) {
	w := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
	rec.WriteHeader(http.StatusTeapot)
	if rec.status != http.StatusTeapot {
		t.Fatalf("status ที่บันทึกไว้ต้องตรงกับที่ WriteHeader ได้ %d", rec.status)
	}
	if w.Code != http.StatusTeapot {
		t.Fatalf("ต้องส่งต่อไปยัง underlying ResponseWriter ด้วย ได้ %d", w.Code)
	}
}

func TestNoDirListing(t *testing.T) {
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })
	h := noDirListing(inner)

	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/", nil))
	if called {
		t.Fatal("path ลงท้ายด้วย / ต้องไม่เรียก handler ข้างใน (กัน directory listing)")
	}
	if w.Code != http.StatusNotFound {
		t.Fatalf("ต้องตอบ 404 ได้ %d", w.Code)
	}

	called = false
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/abc.jpg", nil))
	if !called {
		t.Fatal("path ไฟล์ปกติต้องเรียก handler ข้างใน")
	}
}

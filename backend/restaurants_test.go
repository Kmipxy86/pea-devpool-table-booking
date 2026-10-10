package main

import (
	"net/http"
	"strings"
	"testing"
)

func TestRestaurantInputValidate_Valid(t *testing.T) {
	in := restaurantInput{
		Name: "  ร้านอร่อย  ", Description: " ดีมาก ", Cuisine: " ไทย ", Location: " กรุงเทพ ",
		Seats: 20, Open: "10:00", Close: "22:00", ClosedDays: []int{0},
		CancelMinutes: 60, LimitedPct: 20, Images: []string{"/uploads/a.jpg"},
	}
	rs, err := in.validate()
	if err != nil {
		t.Fatalf("ข้อมูลถูกต้องไม่ควร error: %v", err)
	}
	if rs.Name != "ร้านอร่อย" || rs.Description != "ดีมาก" || rs.Cuisine != "ไทย" || rs.Location != "กรุงเทพ" {
		t.Fatalf("ต้อง trim ช่องว่างรอบข้อความ ได้ %+v", rs)
	}
	if rs.OpenMin != 10*60 || rs.CloseMin != 22*60 {
		t.Fatalf("แปลงเวลาเปิด-ปิดผิด ได้ %d-%d", rs.OpenMin, rs.CloseMin)
	}
	if rs.ClosedDays != 1 {
		t.Fatalf("closed_days bitmask ผิด ได้ %b", rs.ClosedDays)
	}
}

func TestRestaurantInputValidate_DefaultCancelMinutes(t *testing.T) {
	in := restaurantInput{
		Name: "ร้าน", Seats: 1, Open: "10:00", Close: "22:00",
		CancelMinutes: 0, Images: []string{"/uploads/a.jpg"},
	}
	rs, err := in.validate()
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if rs.CancelMinutes != 30 {
		t.Fatalf("CancelMinutes=0 ต้องใช้ค่าตั้งต้น 30 ได้ %d", rs.CancelMinutes)
	}
}

func TestRestaurantInputValidate_Errors(t *testing.T) {
	base := func() restaurantInput {
		return restaurantInput{
			Name: "ร้าน", Seats: 10, Open: "10:00", Close: "22:00",
			CancelMinutes: 30, LimitedPct: 10, Images: []string{"/uploads/a.jpg"},
		}
	}

	cases := []struct {
		name   string
		modify func(*restaurantInput)
		status int
	}{
		{"ชื่อว่าง", func(in *restaurantInput) { in.Name = "   " }, http.StatusBadRequest},
		{"ชื่อยาวเกิน 100", func(in *restaurantInput) { in.Name = strings.Repeat("ก", 101) }, http.StatusBadRequest},
		{"ที่นั่งน้อยไป", func(in *restaurantInput) { in.Seats = 0 }, http.StatusBadRequest},
		{"ที่นั่งเยอะไป", func(in *restaurantInput) { in.Seats = 1001 }, http.StatusBadRequest},
		{"เวลาเปิดรูปแบบผิด", func(in *restaurantInput) { in.Open = "10am" }, http.StatusBadRequest},
		{"เวลาปิดรูปแบบผิด", func(in *restaurantInput) { in.Close = "bad" }, http.StatusBadRequest},
		{"เปิดปิดเวลาเดียวกัน", func(in *restaurantInput) { in.Open, in.Close = "10:00", "10:00" }, http.StatusBadRequest},
		{"ยกเลิกล่วงหน้าน้อยกว่า 30 นาที", func(in *restaurantInput) { in.CancelMinutes = 10 }, http.StatusUnprocessableEntity},
		{"LimitedPct ติดลบ", func(in *restaurantInput) { in.LimitedPct = -1 }, http.StatusBadRequest},
		{"LimitedPct เกิน 100", func(in *restaurantInput) { in.LimitedPct = 101 }, http.StatusBadRequest},
		{"closed day นอกช่วง 0-6", func(in *restaurantInput) { in.ClosedDays = []int{7} }, http.StatusBadRequest},
		{"ปิดทุกวัน", func(in *restaurantInput) { in.ClosedDays = []int{0, 1, 2, 3, 4, 5, 6} }, http.StatusBadRequest},
		{"ไม่มีรูป", func(in *restaurantInput) { in.Images = nil }, http.StatusBadRequest},
		{"รูปเกิน 10", func(in *restaurantInput) {
			imgs := make([]string, 11)
			for i := range imgs {
				imgs[i] = "/uploads/a.jpg"
			}
			in.Images = imgs
		}, http.StatusBadRequest},
		{"รูปไม่ได้มาจาก /uploads/", func(in *restaurantInput) { in.Images = []string{"https://evil.com/a.jpg"} }, http.StatusBadRequest},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := base()
			c.modify(&in)
			_, err := in.validate()
			if err == nil {
				t.Fatalf("%s: ต้อง error", c.name)
			}
			ae, ok := err.(*apiError)
			if !ok || ae.Status != c.status {
				t.Fatalf("%s: ต้องเป็น status %d ได้ %v", c.name, c.status, err)
			}
		})
	}
}

func TestRestaurantHours(t *testing.T) {
	r := restaurant{OpenMin: 18 * 60, CloseMin: 2 * 60, ClosedDays: 1 << 1}
	h := r.hours()
	if h.OpenMin != r.OpenMin || h.CloseMin != r.CloseMin || h.ClosedDays != r.ClosedDays {
		t.Fatalf("hours() ต้องคัดลอกค่าตรง ๆ ได้ %+v", h)
	}
}

func TestRestaurantToJSON(t *testing.T) {
	r := restaurant{
		ID: 1, OwnerID: 99, Name: "ร้าน", OpenMin: 10 * 60, CloseMin: 22 * 60,
		ClosedDays: (1 << 0) | (1 << 3), RatingSum: 9, RatingCount: 2,
	}
	j := r.toJSON(99)
	if !j.IsMine {
		t.Fatal("viewerID ตรงกับ OwnerID ต้อง IsMine=true")
	}
	if j.Rating != 4.5 {
		t.Fatalf("ค่าเฉลี่ย 9/2 ต้องปัดเป็น 4.5 ได้ %v", j.Rating)
	}
	if len(j.ClosedDays) != 2 || j.ClosedDays[0] != 0 || j.ClosedDays[1] != 3 {
		t.Fatalf("closed_days ต้องแตก bitmask กลับเป็น [0,3] ได้ %v", j.ClosedDays)
	}
	if j.Overnight {
		t.Fatal("10:00-22:00 ไม่ใช่ร้านข้ามคืน")
	}

	other := r.toJSON(1)
	if other.IsMine {
		t.Fatal("viewerID ไม่ตรงกับ OwnerID ต้อง IsMine=false")
	}

	anon := r.toJSON(0)
	if anon.IsMine {
		t.Fatal("viewerID=0 (ไม่ได้ login) ต้อง IsMine=false เสมอ")
	}
}

func TestRestaurantToJSON_NoReviewsYet(t *testing.T) {
	r := restaurant{RatingSum: 0, RatingCount: 0}
	j := r.toJSON(0)
	if j.Rating != 0 {
		t.Fatalf("ยังไม่มีรีวิว rating ต้องเป็น 0 ได้ %v", j.Rating)
	}
}

func TestEscapeLike(t *testing.T) {
	cases := map[string]string{
		"abc":        "abc",
		"50%_off":    `50\%\_off`,
		`back\slash`: `back\\slash`,
	}
	for in, want := range cases {
		if got := escapeLike(in); got != want {
			t.Fatalf("escapeLike(%q) = %q, ต้องการ %q", in, got, want)
		}
	}
}

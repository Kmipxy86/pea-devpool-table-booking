package main

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
	_ "time/tzdata" // ฝังข้อมูล timezone ในไฟล์โปรแกรม ใช้ได้แม้เครื่อง Windows ไม่มี tzdata

	"github.com/coreos/go-oidc/v3/oidc"
	_ "github.com/lib/pq"
)

//go:embed schema.sql
var schemaSQL string

// App เก็บของที่ handler ทุกตัวใช้ร่วมกัน
type App struct {
	db        *sql.DB
	loc       *time.Location // Asia/Bangkok
	uploadDir string
	verifier  *oidc.IDTokenVerifier // ตรวจ access token ที่ Keycloak ออกให้
	now       func() time.Time      // แยกไว้เพื่อให้ test กำหนดเวลาเองได้
}

func main() {
	dsn := env("DATABASE_URL", "postgres://tablebook:tablebook@localhost:5432/tablebook?sslmode=disable")
	port := env("PORT", "8080")
	issuer := env("KEYCLOAK_ISSUER", "http://localhost:8081/realms/tablebook")
	clientID := env("KEYCLOAK_CLIENT_ID", "tablebook-web")

	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		log.Fatalf("load timezone: %v", err)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	if err := waitForDB(db); err != nil {
		log.Fatalf("connect db: %v", err)
	}
	if _, err := db.Exec(schemaSQL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	verifier, err := waitForVerifier(issuer, clientID)
	if err != nil {
		log.Fatalf("connect keycloak: %v", err)
	}

	app := &App{
		db:        db,
		loc:       loc,
		uploadDir: env("UPLOAD_DIR", "uploads"),
		verifier:  verifier,
		now:       time.Now,
	}
	if err := os.MkdirAll(app.uploadDir, 0o755); err != nil {
		log.Fatalf("upload dir: %v", err)
	}
	if err := app.seedIfEmpty(context.Background()); err != nil {
		log.Fatalf("seed: %v", err)
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           logRequests(app.routes()),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("API พร้อมใช้งานที่ http://localhost:%s", port)
	log.Fatal(srv.ListenAndServe())
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux() // Go 1.22+ รองรับ method และ {id} ใน pattern

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// บัญชีผู้ใช้ (ยืนยันตัวตนผ่าน Keycloak แล้ว ส่ง access token มาใน Authorization: Bearer)
	mux.HandleFunc("GET /api/auth/me", a.requireUser(a.handleMe))

	// ร้าน
	mux.HandleFunc("GET /api/restaurants", a.handleListRestaurants)
	mux.HandleFunc("POST /api/restaurants", a.requireUser(a.handleCreateRestaurant))
	mux.HandleFunc("GET /api/restaurants/{id}", a.handleGetRestaurant)
	mux.HandleFunc("PUT /api/restaurants/{id}", a.requireUser(a.handleUpdateRestaurant))
	mux.HandleFunc("DELETE /api/restaurants/{id}", a.requireUser(a.handleDeleteRestaurant))
	mux.HandleFunc("GET /api/restaurants/{id}/availability", a.handleAvailability)
	mux.HandleFunc("GET /api/restaurants/{id}/bookings", a.requireUser(a.handleRestaurantBookings))
	mux.HandleFunc("POST /api/restaurants/{id}/reviews", a.requireUser(a.handleCreateReview))
	mux.HandleFunc("GET /api/me/restaurants", a.requireUser(a.handleMyRestaurants))

	// การจอง
	mux.HandleFunc("GET /api/me/bookings", a.requireUser(a.handleMyBookings))
	mux.HandleFunc("POST /api/bookings", a.requireUser(a.handleCreateBooking))
	mux.HandleFunc("GET /api/bookings/{id}", a.requireUser(a.handleGetBooking))
	mux.HandleFunc("PUT /api/bookings/{id}", a.requireUser(a.handleUpdateBooking))
	mux.HandleFunc("DELETE /api/bookings/{id}", a.requireUser(a.handleCancelBooking))

	// รูปภาพ
	mux.HandleFunc("POST /api/uploads", a.requireUser(a.handleUpload))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", noDirListing(http.FileServer(http.Dir(a.uploadDir)))))

	return mux
}

func waitForDB(db *sql.DB) error {
	var err error
	for i := 0; i < 15; i++ {
		if err = db.Ping(); err == nil {
			return nil
		}
		log.Printf("รอฐานข้อมูล... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("database not reachable: %w", err)
}

// waitForVerifier รอ Keycloak เปิด discovery endpoint (oidc.NewProvider ล้มเหลวทันทีถ้า issuer ยังไม่ตอบ)
func waitForVerifier(issuer, clientID string) (*oidc.IDTokenVerifier, error) {
	var err error
	for i := 0; i < 15; i++ {
		var v *oidc.IDTokenVerifier
		if v, err = newVerifier(context.Background(), issuer, clientID); err == nil {
			return v, nil
		}
		log.Printf("รอ Keycloak... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("keycloak not reachable: %w", err)
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

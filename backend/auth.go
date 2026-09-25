package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/lib/pq"
)

const (
	sessionCookie = "tb_session"
	sessionTTL    = 7 * 24 * time.Hour
	pbkdf2Iter    = 120_000
)

type User struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type authedHandler func(w http.ResponseWriter, r *http.Request, u *User)

// requireUser ห่อ handler ที่ต้อง login ถ้าไม่มี session ที่ใช้ได้ ตอบ 401
func (a *App) requireUser(h authedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, err := a.currentUser(r)
		if err != nil {
			writeError(w, err)
			return
		}
		if u == nil {
			writeError(w, errf(http.StatusUnauthorized, "กรุณาเข้าสู่ระบบ"))
			return
		}
		h(w, r, u)
	}
}

// currentUser คืน nil (ไม่ใช่ error) ถ้ายังไม่ login
func (a *App) currentUser(r *http.Request) (*User, error) {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return nil, nil
	}
	var u User
	err = a.db.QueryRowContext(r.Context(), `
		SELECT u.id, u.email, u.name
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`, sha256Hex(c.Value)).
		Scan(&u.ID, &u.Email, &u.Name)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func userID(u *User) int64 {
	if u == nil {
		return 0
	}
	return u.ID
}

type registerInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

func (a *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	var in registerInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	if _, err := mail.ParseAddress(in.Email); err != nil {
		writeError(w, errf(http.StatusBadRequest, "รูปแบบอีเมลไม่ถูกต้อง"))
		return
	}
	if utf8.RuneCountInString(in.Password) < 8 {
		writeError(w, errf(http.StatusBadRequest, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"))
		return
	}
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 60 {
		writeError(w, errf(http.StatusBadRequest, "กรุณากรอกชื่อ (ไม่เกิน 60 ตัวอักษร)"))
		return
	}

	hash, err := hashPassword(in.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	u := User{Email: in.Email, Name: in.Name}
	err = a.db.QueryRowContext(r.Context(),
		`INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
		u.Email, u.Name, hash).Scan(&u.ID)
	var pqErr *pq.Error
	if errors.As(err, &pqErr) && pqErr.Code == "23505" { // unique_violation
		writeError(w, errf(http.StatusConflict, "อีเมลนี้ถูกใช้สมัครแล้ว"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if err := a.createSession(r.Context(), w, u.ID); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	var u User
	var hash string
	err := a.db.QueryRowContext(r.Context(),
		`SELECT id, email, name, password_hash FROM users WHERE email = $1`,
		strings.ToLower(strings.TrimSpace(in.Email))).Scan(&u.ID, &u.Email, &u.Name, &hash)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !checkPassword(in.Password, hash)) {
		// ไม่บอกว่าผิดที่อีเมลหรือรหัสผ่าน เพื่อไม่ให้เดาได้ว่าอีเมลไหนมีในระบบ
		writeError(w, errf(http.StatusUnauthorized, "อีเมลหรือรหัสผ่านไม่ถูกต้อง"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if err := a.createSession(r.Context(), w, u.ID); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_, _ = a.db.ExecContext(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, sha256Hex(c.Value))
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: a.secureCookie,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request, u *User) {
	writeJSON(w, http.StatusOK, u)
}

// createSession สร้าง token สุ่ม เก็บ hash ลง DB แล้วส่ง token จริงไปใน cookie แบบ HttpOnly
// (JavaScript ในหน้าเว็บอ่าน cookie นี้ไม่ได้ ลดความเสี่ยงจาก XSS)
func (a *App) createSession(ctx context.Context, w http.ResponseWriter, uid int64) error {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	expires := a.now().Add(sessionTTL)
	if _, err := a.db.ExecContext(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
		sha256Hex(token), uid, expires); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode, // เว็บอื่นส่ง POST มาพร้อม cookie นี้ไม่ได้ (กัน CSRF พื้นฐาน)
		Secure:   a.secureCookie,
	})
	return nil
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// ---- รหัสผ่าน: PBKDF2-HMAC-SHA256 (เขียนเองจาก standard library ไม่ต้องพึ่ง package นอก) ----
// รูปแบบที่เก็บ: pbkdf2_sha256$<รอบ>$<salt base64>$<hash base64>

func hashPassword(pw string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := pbkdf2SHA256([]byte(pw), salt, pbkdf2Iter, 32)
	return fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", pbkdf2Iter,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

func checkPassword(pw, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 1 {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[2])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[3])
	if err1 != nil || err2 != nil {
		return false
	}
	got := pbkdf2SHA256([]byte(pw), salt, iter, len(want))
	return subtle.ConstantTimeCompare(got, want) == 1 // เทียบแบบใช้เวลาเท่ากันเสมอ
}

func pbkdf2SHA256(password, salt []byte, iter, keyLen int) []byte {
	prf := hmac.New(sha256.New, password)
	hLen := prf.Size()
	blocks := (keyLen + hLen - 1) / hLen
	out := make([]byte, 0, blocks*hLen)
	counter := make([]byte, 4)
	for b := 1; b <= blocks; b++ {
		prf.Reset()
		prf.Write(salt)
		binary.BigEndian.PutUint32(counter, uint32(b))
		prf.Write(counter)
		u := prf.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iter; i++ {
			prf.Reset()
			prf.Write(u)
			u = prf.Sum(u[:0])
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}

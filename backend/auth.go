package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type User struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type authedHandler func(w http.ResponseWriter, r *http.Request, u *User)

// requireUser ห่อ handler ที่ต้อง login ถ้าไม่มี token ที่ใช้ได้ ตอบ 401
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

// currentUser คืน nil (ไม่ใช่ error) ถ้ายังไม่ login หรือ token ใช้ไม่ได้แล้ว
// (endpoint สาธารณะบางตัวเรียกฟังก์ชันนี้ตรง ๆ เพื่อดู viewer แบบ optional จึงห้ามคืน error จาก token ที่ตรวจไม่ผ่าน)
func (a *App) currentUser(r *http.Request) (*User, error) {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" {
		return nil, nil
	}
	idTok, err := a.verifier.Verify(r.Context(), tok)
	if err != nil {
		return nil, nil
	}
	var claims struct {
		Email             string `json:"email"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
	}
	if err := idTok.Claims(&claims); err != nil {
		return nil, nil
	}
	name := claims.Name
	if name == "" {
		name = claims.PreferredUsername
	}
	email := claims.Email
	if email == "" {
		email = claims.PreferredUsername
	}
	return a.upsertUser(r.Context(), idTok.Subject, email, name)
}

// upsertUser สร้าง user ในระบบตอน login ครั้งแรก (JIT provisioning) หรืออัปเดต email/name ถ้าเปลี่ยนใน Keycloak
func (a *App) upsertUser(ctx context.Context, sub, email, name string) (*User, error) {
	var u User
	err := a.db.QueryRowContext(ctx, `
		INSERT INTO users (keycloak_sub, email, name) VALUES ($1, $2, $3)
		ON CONFLICT (keycloak_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
		RETURNING id, email, name`, sub, email, name).Scan(&u.ID, &u.Email, &u.Name)
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

func (a *App) handleMe(w http.ResponseWriter, r *http.Request, u *User) {
	writeJSON(w, http.StatusOK, u)
}

// newVerifier ตั้งค่า OIDC provider จาก issuer ของ Keycloak โดยลองใหม่จนกว่า discovery endpoint จะพร้อม
func newVerifier(ctx context.Context, issuer, clientID string) (*oidc.IDTokenVerifier, error) {
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, err
	}
	return provider.Verifier(&oidc.Config{ClientID: clientID}), nil
}

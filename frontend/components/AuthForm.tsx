"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

// Client Component เพราะมี state ของฟอร์มและต้องเรียก API ตอนกดปุ่ม
// session เก็บใน cookie แบบ HttpOnly ที่ Go ตั้งให้ หน้าเว็บไม่ต้องแตะ token เอง
export default function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(isLogin ? { email, password } : { email, password, name }),
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  const nextQs = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="auth">
      <section className="auth-side">
        <h1>{"บัญชีเดียว\nจองร้านคนอื่น\nเปิดร้านของเรา"}</h1>
        <div className="role"><i /><div><b>ลูกค้าและผู้รีวิว</b><p className="small muted">ดูร้าน จอง แก้ไข ยกเลิก และให้คะแนนร้านของคนอื่น</p></div></div>
        <div className="role"><i className="white" /><div><b>เจ้าของร้าน</b><p className="small muted">สร้างร้าน ตั้งที่นั่ง เวลาเปิด–ปิด และเวลายกเลิกล่วงหน้า</p></div></div>
      </section>
      <section className="auth-form">
        <form onSubmit={onSubmit}>
          <div className="tabs" style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <Link href={`/login${nextQs}`} className={`tab${isLogin ? " active" : ""}`} style={{ justifyContent: "center" }}>เข้าสู่ระบบ</Link>
            <Link href={`/register${nextQs}`} className={`tab${!isLogin ? " active" : ""}`} style={{ justifyContent: "center" }}>สมัครสมาชิก</Link>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h2 style={{ fontSize: 28 }}>{isLogin ? "ยินดีต้อนรับกลับ" : "สร้างบัญชีใหม่"}</h2>
            <p className="muted small">{isLogin ? "เข้าสู่ระบบเพื่อจองโต๊ะหรือจัดการร้านของคุณ" : "สมัครครั้งเดียว ใช้ได้ทั้งเป็นลูกค้าและเจ้าของร้าน"}</p>
          </div>
          {!isLogin && (
            <label className="field">ชื่อที่แสดง
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" />
            </label>
          )}
          <label className="field">อีเมล
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field">รหัสผ่าน
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isLogin ? undefined : 8} autoComplete={isLogin ? "current-password" : "new-password"} />
            {!isLogin && <span className="hint">อย่างน้อย 8 ตัวอักษร</span>}
          </label>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
            {loading ? "กำลังดำเนินการ..." : isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
          {isLogin && (
            <div className="alert alert-info" style={{ flexDirection: "column", gap: 2 }}>
              <b>บัญชีทดสอบ (รหัสผ่าน password123)</b>
              <span className="mono xs">customer@example.com — ลูกค้า</span>
              <span className="mono xs">owner@example.com — เจ้าของ 2 ร้าน</span>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

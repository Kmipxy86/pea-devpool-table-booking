import Link from "next/link";
import { safeNext } from "@/lib/format";

type Props = { searchParams: Promise<{ next?: string }> };

// login ทั้งหมดทำผ่าน Keycloak (หน้า hosted login ของ Keycloak เอง รวมถึงสมัครสมาชิกถ้าเปิด self-registration ไว้)
// หน้านี้เป็นแค่ landing page พาไปเริ่ม PKCE flow ที่ /api/auth/login
export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const nextQs = safeNext(next) !== "/" ? `?next=${encodeURIComponent(safeNext(next))}` : "";
  return (
    <div className="auth">
      <section className="auth-side">
        <h1>{"บัญชีเดียว\nจองร้านคนอื่น\nเปิดร้านของเรา"}</h1>
        <div className="role"><i /><div><b>ลูกค้าและผู้รีวิว</b><p className="small muted">ดูร้าน จอง แก้ไข ยกเลิก และให้คะแนนร้านของคนอื่น</p></div></div>
        <div className="role"><i className="white" /><div><b>เจ้าของร้าน</b><p className="small muted">สร้างร้าน ตั้งที่นั่ง เวลาเปิด–ปิด และเวลายกเลิกล่วงหน้า</p></div></div>
      </section>
      <section className="auth-form">
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 style={{ fontSize: 28 }}>ยินดีต้อนรับ</h2>
            <p className="muted small">เข้าสู่ระบบด้วยบัญชี Keycloak เพื่อจองโต๊ะหรือจัดการร้านของคุณ</p>
          </div>
          <Link href={`/api/auth/login${nextQs}`} className="btn btn-primary btn-lg">เข้าสู่ระบบด้วย Keycloak</Link>
          <div className="alert alert-info" style={{ flexDirection: "column", gap: 2 }}>
            <b>บัญชีทดสอบ (รหัสผ่าน password123)</b>
            <span className="mono xs">customer@example.com — ลูกค้า</span>
            <span className="mono xs">owner@example.com — เจ้าของ 2 ร้าน</span>
          </div>
        </div>
      </section>
    </div>
  );
}

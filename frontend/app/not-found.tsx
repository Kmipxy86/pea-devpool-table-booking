import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container page" style={{ alignItems: "center", textAlign: "center", paddingTop: 80 }}>
      <h1>ไม่พบหน้านี้</h1>
      <p className="muted">หน้าที่คุณหาอาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
      <Link href="/" className="btn btn-dark">กลับหน้าแรก</Link>
    </main>
  );
}

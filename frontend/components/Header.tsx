import Link from "next/link";
import { getMe } from "@/lib/server-api";
import NavLinks from "./NavLinks";
import LogoutButton from "./LogoutButton";

// Server Component: ถาม Go ว่าใคร login อยู่ ตั้งแต่ฝั่ง server (ไม่มีหน้าจอกระพริบ)
export default async function Header() {
  const me = await getMe();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark"><span /></span>
          <span className="brand-text">โต๊ะว่าง</span>
        </Link>
        <nav className="nav" aria-label="เมนูหลัก">
          <NavLinks />
          {me ? (
            <>
              <span className="avatar" title={`${me.name} (${me.email})`}>{Array.from(me.name).slice(0, 2).join("")}</span>
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className="btn btn-dark btn-sm" style={{ marginLeft: 8 }}>เข้าสู่ระบบ</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

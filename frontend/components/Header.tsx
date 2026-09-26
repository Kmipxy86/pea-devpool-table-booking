import Link from "next/link";
import { getMe } from "@/lib/server-api";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import NavLinks from "./NavLinks";
import LogoutButton from "./LogoutButton";
import LanguageToggle from "./LanguageToggle";

// Server Component: ถาม Go ว่าใคร login อยู่ ตั้งแต่ฝั่ง server (ไม่มีหน้าจอกระพริบ)
export default async function Header() {
  const [me, locale] = await Promise.all([getMe(), getLocale()]);
  const s = t[locale];
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark"><span /></span>
          <span className="brand-text">{s.brand}</span>
        </Link>
        <nav className="nav" aria-label={s.mainNav}>
          <NavLinks locale={locale} />
          <LanguageToggle locale={locale} />
          {me ? (
            <>
              <span className="avatar" title={`${me.name} (${me.email})`}>{Array.from(me.name).slice(0, 2).join("")}</span>
              <LogoutButton label={s.logout} />
            </>
          ) : (
            <Link href="/login" className="btn btn-dark btn-sm" style={{ marginLeft: 8 }}>{s.login}</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

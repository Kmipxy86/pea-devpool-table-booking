import Link from "next/link";
import { getMe } from "@/lib/server-api";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import OwnerNavLinks from "@/components/OwnerNavLinks";
import LogoutButton from "@/components/LogoutButton";
import LanguageToggle from "@/components/LanguageToggle";

// Owner console: header คนละชุดกับฝั่งลูกค้า (frontend/app/(customer)/layout.tsx)
// เพื่อให้การ "จัดการร้าน" รู้สึกเป็นคนละโหมดกับการ "เดินดูร้าน"
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const [me, locale] = await Promise.all([getMe(), getLocale()]);
  const s = t[locale];
  return (
    <>
      <header className="site-header owner-header">
        <div className="container header-inner">
          <Link href="/owner" className="brand">
            <span className="brand-mark"><span /></span>
            <span className="brand-text">{s.ownerConsoleTitle}</span>
          </Link>
          <nav className="nav" aria-label={s.ownerNav}>
            <OwnerNavLinks locale={locale} />
            <LanguageToggle locale={locale} />
            <Link href="/" className="nav-link">{s.backToBrowsing}</Link>
            {me && (
              <>
                <span className="avatar" title={`${me.name} (${me.email})`}>{Array.from(me.name).slice(0, 2).join("")}</span>
                <LogoutButton label={s.logout} />
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}

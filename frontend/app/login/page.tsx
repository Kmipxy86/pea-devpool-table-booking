import Link from "next/link";
import { safeNext } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";

type Props = { searchParams: Promise<{ next?: string }> };

// login ทั้งหมดทำผ่าน Keycloak (หน้า hosted login ของ Keycloak เอง รวมถึงสมัครสมาชิกถ้าเปิด self-registration ไว้)
// หน้านี้เป็นแค่ landing page พาไปเริ่ม PKCE flow ที่ /api/auth/login
export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const nextQs = safeNext(next) !== "/" ? `?next=${encodeURIComponent(safeNext(next))}` : "";
  const locale = await getLocale();
  const s = t[locale];
  return (
    <div className="auth">
      <section className="auth-side">
        <h1>{s.loginHeroTitle}</h1>
        <div className="role"><i /><div><b>{s.loginRoleCustomer}</b><p className="small muted">{s.loginRoleCustomerDesc}</p></div></div>
        <div className="role"><i className="white" /><div><b>{s.loginRoleOwner}</b><p className="small muted">{s.loginRoleOwnerDesc}</p></div></div>
      </section>
      <section className="auth-form">
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 style={{ fontSize: 28 }}>{s.loginTitle}</h2>
            <p className="muted small">{s.loginSubtitle}</p>
          </div>
          <Link href={`/api/auth/login${nextQs}`} className="btn btn-primary btn-lg">{s.loginCta}</Link>
          <div className="row small muted" style={{ justifyContent: "center", gap: 8 }}>
            <span>{s.orDivider}</span>
            <Link href={`/api/auth/register${nextQs}`}>{s.registerCta}</Link>
          </div>
          <div className="alert alert-info" style={{ flexDirection: "column", gap: 2 }}>
            <b>{s.loginDemoTitle}</b>
            <span className="mono xs">customer@example.com — {s.loginDemoCustomer}</span>
            <span className="mono xs">owner@example.com — {s.loginDemoOwner}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

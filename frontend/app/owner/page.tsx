import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { Restaurant } from "@/lib/types";
import { cancelLabel } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Rating from "@/components/Stars";

export default async function OwnerPage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/owner");
  const [list, locale] = await Promise.all([
    serverGet<Restaurant[]>("/api/me/restaurants").then((r) => r ?? []),
    getLocale(),
  ]);
  const s = t[locale];

  return (
    <main className="container page">
      <div className="between">
        <div className="stack" style={{ gap: 2 }}>
          <h1>{s.navOwner}</h1>
          <span className="muted small">{s.ownerSubtitle}</span>
        </div>
        <Link href="/owner/new" className="btn btn-primary">{s.createNew}</Link>
      </div>
      {list.length === 0 && (
        <div className="card empty">
          {s.noRestaurants} <Link href="/owner/new">{s.createFirst}</Link>
        </div>
      )}
      {list.map((r) => (
        <article key={r.id} className="card card-tight owner-item">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.cover} alt="" />
          <div className="stack" style={{ gap: 2, flex: 1 }}>
            <div className="row"><Link href={`/owner/${r.id}`} style={{ color: "var(--ink)", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 21 }}>{r.name}</Link><Rating value={r.rating} count={r.review_count} locale={locale} /></div>
            <span className="small muted">{[r.cuisine, r.location].filter(Boolean).join(" · ")} · {r.seats} {s.seatsSuffix} · <span className="mono">{r.open}–{r.close}</span> · {s.cancelAdvancePrefix} {cancelLabel(r.cancel_minutes, locale)}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href={`/owner/${r.id}`} className="btn btn-dark btn-sm">{s.viewBookings}</Link>
            <Link href={`/owner/${r.id}/edit`} className="btn btn-outline btn-sm">{s.edit}</Link>
            <Link href={`/restaurants/${r.id}`} className="btn btn-ghost btn-sm">{s.storefront}</Link>
          </div>
        </article>
      ))}
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { Booking } from "@/lib/types";
import { thaiDate, thaiDateTime } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import CancelBookingButton from "@/components/CancelBookingButton";

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function MyBookingsPage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) redirect("/login?next=/bookings");
  const { tab = "upcoming" } = await searchParams;
  const [all, locale] = await Promise.all([
    serverGet<Booking[]>("/api/me/bookings").then((b) => b ?? []),
    getLocale(),
  ]);
  const s = t[locale];

  const groups = {
    upcoming: all.filter((b) => b.status === "confirmed" && !b.is_past),
    past: all.filter((b) => b.status === "confirmed" && b.is_past).reverse(),
    cancelled: all.filter((b) => b.status === "cancelled").reverse(),
  };
  const current = groups[tab as keyof typeof groups] ?? groups.upcoming;
  const tabs: [keyof typeof groups, string][] = [["upcoming", s.tabUpcoming], ["past", s.tabPast], ["cancelled", s.tabCancelled]];

  return (
    <main className="container page" style={{ maxWidth: 820 }}>
      <h1>{s.myBookingsTitle}</h1>
      <nav className="tabs" aria-label={s.filterBookingsAria} style={{ alignSelf: "flex-start" }}>
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/bookings?tab=${key}`} className={`tab${tab === key ? " active" : ""}`}>
            {label} · {groups[key].length}
          </Link>
        ))}
      </nav>

      {current.length === 0 && (
        <div className="card empty">
          {s.noBookings} <Link href="/">{s.goFindRestaurant}</Link>
        </div>
      )}

      {current.map((b) => {
        const [, , day] = b.date.split("-");
        return (
          <article key={b.id} className="booking-card">
            <div className={`booking-date${b.status === "confirmed" && !b.is_past ? "" : " muted-date"}`}>
              <span className="xs">{thaiDate(b.date, { day: undefined, month: undefined }, locale)}</span>
              <span className="d">{Number(day)}</span>
              <span className="xs">{thaiDate(b.date, { weekday: undefined, day: undefined }, locale)}</span>
            </div>
            <div className="booking-body">
              <div className="between">
                <Link href={`/restaurants/${b.restaurant_id}`} style={{ color: "var(--ink)", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>{b.restaurant_name}</Link>
                <span className="mono xs muted">#{String(b.id).padStart(4, "0")}</span>
              </div>
              <div className="row small" style={{ gap: 18 }}>
                <b className="mono">{b.start}–{b.end}</b>
                <span>{b.party} {s.partySuffix}</span>
                {b.status === "confirmed" && !b.is_past && <span className="muted">{s.cancelUntil} <b className="mono">{thaiDateTime(b.cancel_deadline, locale)}</b></span>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                {b.status === "cancelled" && <span className="badge">{s.cancelledBadge}</span>}
                {b.can_modify && (
                  <>
                    <Link href={`/bookings/${b.id}/edit`} className="btn btn-dark btn-sm">{s.edit}</Link>
                    <CancelBookingButton id={b.id} locale={locale} />
                  </>
                )}
                {b.status === "confirmed" && !b.is_past && !b.can_modify && (
                  <span className="small muted">{s.pastEditWindow}</span>
                )}
                {b.status === "confirmed" && b.is_past && (
                  <Link href={`/restaurants/${b.restaurant_id}#review`} className="btn btn-outline btn-sm">{s.writeReview}</Link>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </main>
  );
}

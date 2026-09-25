import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { OwnerDay, RestaurantDetail } from "@/lib/types";
import { addDays, thaiDate, todayBangkok } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import DeleteRestaurantButton from "@/components/DeleteRestaurantButton";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> };

// ต่อยอด: เจ้าของร้านดูว่าแต่ละช่วงมีคนจองกี่คน
export default async function OwnerRestaurantPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { date = todayBangkok() } = await searchParams;
  if (!(await getMe())) redirect(`/login?next=/owner/${id}`);
  const locale = await getLocale();
  const s = t[locale];
  const r = await serverGet<RestaurantDetail>(`/api/restaurants/${id}`);
  if (!r || !r.is_mine) notFound();
  const day = await serverGet<OwnerDay>(`/api/restaurants/${id}/bookings?date=${encodeURIComponent(date)}`);
  if (!day) notFound();

  const confirmed = day.bookings.filter((b) => b.status === "confirmed");
  const people = confirmed.reduce((sum, b) => sum + b.party, 0);
  const peak = Math.max(0, ...day.slots.map((sl) => sl.used));
  const fullSlots = day.slots.filter((sl) => sl.used >= day.seats);
  const H = 140;

  return (
    <main className="container page">
      <nav className="small"><Link href="/owner">← {s.navOwner}</Link></nav>
      <div className="between">
        <div className="stack" style={{ gap: 2 }}>
          <h1>{r.name}</h1>
          <span className="muted small">{r.seats} {s.seatsSuffix} · {s.openLabel} <span className="mono">{r.open}–{r.close}</span></span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href={`/restaurants/${r.id}`} className="btn btn-ghost btn-sm">{s.storefront}</Link>
          <Link href={`/owner/${r.id}/edit`} className="btn btn-outline btn-sm">{s.editRestaurant}</Link>
          <DeleteRestaurantButton id={r.id} name={r.name} locale={locale} />
        </div>
      </div>

      <form className="row" action={`/owner/${r.id}`}>
        <Link href={`/owner/${r.id}?date=${addDays(date, -1)}`} className="btn btn-outline btn-sm" aria-label={s.prevDayAria}>←</Link>
        <input className="input" type="date" name="date" defaultValue={date} style={{ width: 180 }} aria-label={s.selectDateAria} />
        <button className="btn btn-dark btn-sm" type="submit">{s.viewBtn}</button>
        <Link href={`/owner/${r.id}?date=${addDays(date, 1)}`} className="btn btn-outline btn-sm" aria-label={s.nextDayAria}>→</Link>
        <b style={{ marginLeft: 8 }}>{thaiDate(date, { year: "numeric" }, locale)}</b>
      </form>

      <div className="stats">
        <div className="stat"><span className="small muted">{s.statBookings}</span><span className="v">{confirmed.length} <span className="small muted">{s.entriesUnit}</span></span></div>
        <div className="stat"><span className="small muted">{s.statUpcomingGuests}</span><span className="v">{people} <span className="small muted">{s.partySuffix}</span></span></div>
        <div className="stat"><span className="small muted">{s.statPeak}</span><span className="v">{peak}<span className="small muted">/{day.seats}</span></span></div>
        <div className="stat dark"><span className="small muted">{s.statFullSlots}</span><span className="v mono" style={{ fontSize: 20, lineHeight: 1.9 }}>{fullSlots.length ? fullSlots.slice(0, 3).map((sl) => sl.start).join(", ") : s.noneLabel}</span></div>
      </div>

      <section className="card stack">
        <div className="between">
          <h2 style={{ fontSize: 19 }}>{s.seatsBookedTitle}</h2>
          <div className="legend">
            <span><i style={{ background: "var(--gray-300)" }} />{s.legendNormal}</span>
            <span><i style={{ background: "var(--orange-500)" }} />{s.legendNearFull}</span>
            <span><i style={{ background: "var(--ink)" }} />{s.legendFull}</span>
          </div>
        </div>
        {day.closed ? <p className="muted">{s.closedToday}</p> : (
          <>
            <div style={{ position: "relative", height: H + 10 }}>
              <div style={{ display: "flex", gap: 4, height: H + 10, alignItems: "flex-end" }}>
                {day.slots.map((sl) => {
                  const ratio = sl.used / day.seats;
                  const color = ratio >= 1 ? "var(--ink)" : sl.remaining <= day.limited_threshold && sl.used > 0 ? "var(--orange-500)" : "var(--gray-300)";
                  return <div key={sl.start} title={s.slotTooltip(sl.start, sl.end, sl.used, day.seats)} style={{ flex: 1, minWidth: 0, height: Math.min(ratio, 1) * H, background: color, borderRadius: "4px 4px 0 0" }} />;
                })}
              </div>
              <div className="cap-line" style={{ bottom: H }} />
            </div>
            <div className="tl-labels">{day.slots.map((sl, i) => <span key={sl.start}>{i % 4 === 0 ? sl.start : ""}</span>)}</div>
          </>
        )}
      </section>

      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="between" style={{ padding: "18px 20px" }}><h2 style={{ fontSize: 19 }}>{s.bookingsListTitle}</h2><span className="xs muted">{s.entriesCount(day.bookings.length)}</span></div>
        {day.bookings.length === 0 ? <p className="muted" style={{ padding: "0 20px 20px" }}>{s.noBookingsToday}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{s.colTime}</th><th>{s.colCustomer}</th><th>{s.colParty}</th><th>{s.colNumber}</th><th>{s.colStatus}</th></tr></thead>
              <tbody>
                {day.bookings.map((b) => (
                  <tr key={b.id} style={b.status === "cancelled" ? { color: "var(--gray-600)" } : undefined}>
                    <td className="mono" style={{ fontWeight: 600 }}>{b.start}–{b.end}</td>
                    <td>{b.user_name} <span className="xs muted">{b.user_email}</span></td>
                    <td>{b.party} {s.partySuffix}</td>
                    <td className="mono muted">#{String(b.id).padStart(4, "0")}</td>
                    <td><span className={`badge${b.status === "confirmed" ? "" : " badge-orange"}`}>{b.status === "confirmed" ? s.confirmedStatus : s.cancelledStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

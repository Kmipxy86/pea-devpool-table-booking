import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { OwnerDay, RestaurantDetail } from "@/lib/types";
import { addDays, thaiDate, todayBangkok } from "@/lib/format";
import DeleteRestaurantButton from "@/components/DeleteRestaurantButton";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> };

// ต่อยอด: เจ้าของร้านดูว่าแต่ละช่วงมีคนจองกี่คน
export default async function OwnerRestaurantPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { date = todayBangkok() } = await searchParams;
  if (!(await getMe())) redirect(`/login?next=/owner/${id}`);
  const r = await serverGet<RestaurantDetail>(`/api/restaurants/${id}`);
  if (!r || !r.is_mine) notFound();
  const day = await serverGet<OwnerDay>(`/api/restaurants/${id}/bookings?date=${encodeURIComponent(date)}`);
  if (!day) notFound();

  const confirmed = day.bookings.filter((b) => b.status === "confirmed");
  const people = confirmed.reduce((s, b) => s + b.party, 0);
  const peak = Math.max(0, ...day.slots.map((s) => s.used));
  const fullSlots = day.slots.filter((s) => s.used >= day.seats);
  const H = 140;

  return (
    <main className="container page">
      <nav className="small"><Link href="/owner">← ร้านของฉัน</Link></nav>
      <div className="between">
        <div className="stack" style={{ gap: 2 }}>
          <h1>{r.name}</h1>
          <span className="muted small">{r.seats} ที่นั่ง · เปิด <span className="mono">{r.open}–{r.close}</span></span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href={`/restaurants/${r.id}`} className="btn btn-ghost btn-sm">หน้าร้าน</Link>
          <Link href={`/owner/${r.id}/edit`} className="btn btn-outline btn-sm">แก้ไขร้าน</Link>
          <DeleteRestaurantButton id={r.id} name={r.name} />
        </div>
      </div>

      <form className="row" action={`/owner/${r.id}`}>
        <Link href={`/owner/${r.id}?date=${addDays(date, -1)}`} className="btn btn-outline btn-sm" aria-label="วันก่อนหน้า">←</Link>
        <input className="input" type="date" name="date" defaultValue={date} style={{ width: 180 }} aria-label="เลือกวันที่" />
        <button className="btn btn-dark btn-sm" type="submit">ดู</button>
        <Link href={`/owner/${r.id}?date=${addDays(date, 1)}`} className="btn btn-outline btn-sm" aria-label="วันถัดไป">→</Link>
        <b style={{ marginLeft: 8 }}>{thaiDate(date, { year: "numeric" })}</b>
      </form>

      <div className="stats">
        <div className="stat"><span className="small muted">การจอง</span><span className="v">{confirmed.length} <span className="small muted">รายการ</span></span></div>
        <div className="stat"><span className="small muted">ลูกค้าที่จะมา</span><span className="v">{people} <span className="small muted">คน</span></span></div>
        <div className="stat"><span className="small muted">นั่งพร้อมกันสูงสุด</span><span className="v">{peak}<span className="small muted">/{day.seats}</span></span></div>
        <div className="stat dark"><span className="small muted">ช่วงที่เต็ม</span><span className="v mono" style={{ fontSize: 20, lineHeight: 1.9 }}>{fullSlots.length ? fullSlots.slice(0, 3).map((s) => s.start).join(", ") : "ไม่มี"}</span></div>
      </div>

      <section className="card stack">
        <div className="between">
          <h2 style={{ fontSize: 19 }}>ที่นั่งที่ถูกจอง ทุก 30 นาที</h2>
          <div className="legend">
            <span><i style={{ background: "var(--gray-300)" }} />ปกติ</span>
            <span><i style={{ background: "var(--orange-500)" }} />ใกล้เต็ม</span>
            <span><i style={{ background: "var(--ink)" }} />เต็ม</span>
          </div>
        </div>
        {day.closed ? <p className="muted">ร้านปิดวันนี้</p> : (
          <>
            <div style={{ position: "relative", height: H + 10 }}>
              <div style={{ display: "flex", gap: 4, height: H + 10, alignItems: "flex-end" }}>
                {day.slots.map((s) => {
                  const ratio = s.used / day.seats;
                  const color = ratio >= 1 ? "var(--ink)" : s.remaining <= day.limited_threshold && s.used > 0 ? "var(--orange-500)" : "var(--gray-300)";
                  return <div key={s.start} title={`${s.start}–${s.end}: ${s.used}/${day.seats} ที่`} style={{ flex: 1, minWidth: 0, height: Math.min(ratio, 1) * H, background: color, borderRadius: "4px 4px 0 0" }} />;
                })}
              </div>
              <div className="cap-line" style={{ bottom: H }} />
            </div>
            <div className="tl-labels">{day.slots.map((s, i) => <span key={s.start}>{i % 4 === 0 ? s.start : ""}</span>)}</div>
          </>
        )}
      </section>

      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="between" style={{ padding: "18px 20px" }}><h2 style={{ fontSize: 19 }}>รายการจอง</h2><span className="xs muted">{day.bookings.length} รายการ</span></div>
        {day.bookings.length === 0 ? <p className="muted" style={{ padding: "0 20px 20px" }}>ยังไม่มีการจองในวันนี้</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>เวลา</th><th>ผู้จอง</th><th>จำนวน</th><th>เลขที่</th><th>สถานะ</th></tr></thead>
              <tbody>
                {day.bookings.map((b) => (
                  <tr key={b.id} style={b.status === "cancelled" ? { color: "var(--gray-600)" } : undefined}>
                    <td className="mono" style={{ fontWeight: 600 }}>{b.start}–{b.end}</td>
                    <td>{b.user_name} <span className="xs muted">{b.user_email}</span></td>
                    <td>{b.party} คน</td>
                    <td className="mono muted">#{String(b.id).padStart(4, "0")}</td>
                    <td><span className={`badge${b.status === "confirmed" ? "" : " badge-orange"}`}>{b.status === "confirmed" ? "ยืนยันแล้ว" : "ยกเลิก"}</span></td>
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

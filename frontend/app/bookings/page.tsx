import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { Booking } from "@/lib/types";
import { thaiDate, thaiDateTime } from "@/lib/format";
import CancelBookingButton from "@/components/CancelBookingButton";

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function MyBookingsPage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) redirect("/login?next=/bookings");
  const { tab = "upcoming" } = await searchParams;
  const all = (await serverGet<Booking[]>("/api/me/bookings")) ?? [];

  const groups = {
    upcoming: all.filter((b) => b.status === "confirmed" && !b.is_past),
    past: all.filter((b) => b.status === "confirmed" && b.is_past).reverse(),
    cancelled: all.filter((b) => b.status === "cancelled").reverse(),
  };
  const current = groups[tab as keyof typeof groups] ?? groups.upcoming;
  const tabs: [keyof typeof groups, string][] = [["upcoming", "กำลังจะถึง"], ["past", "ผ่านไปแล้ว"], ["cancelled", "ยกเลิกแล้ว"]];

  return (
    <main className="container page" style={{ maxWidth: 820 }}>
      <h1>การจองของฉัน</h1>
      <nav className="tabs" aria-label="กรองการจอง" style={{ alignSelf: "flex-start" }}>
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/bookings?tab=${key}`} className={`tab${tab === key ? " active" : ""}`}>
            {label} · {groups[key].length}
          </Link>
        ))}
      </nav>

      {current.length === 0 && (
        <div className="card empty">
          ยังไม่มีรายการ <Link href="/">ไปหาร้านเพื่อจอง</Link>
        </div>
      )}

      {current.map((b) => {
        const [, , day] = b.date.split("-");
        return (
          <article key={b.id} className="booking-card">
            <div className={`booking-date${b.status === "confirmed" && !b.is_past ? "" : " muted-date"}`}>
              <span className="xs">{thaiDate(b.date, { day: undefined, month: undefined })}</span>
              <span className="d">{Number(day)}</span>
              <span className="xs">{thaiDate(b.date, { weekday: undefined, day: undefined })}</span>
            </div>
            <div className="booking-body">
              <div className="between">
                <Link href={`/restaurants/${b.restaurant_id}`} style={{ color: "var(--ink)", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>{b.restaurant_name}</Link>
                <span className="mono xs muted">#{String(b.id).padStart(4, "0")}</span>
              </div>
              <div className="row small" style={{ gap: 18 }}>
                <b className="mono">{b.start}–{b.end}</b>
                <span>{b.party} คน</span>
                {b.status === "confirmed" && !b.is_past && <span className="muted">ยกเลิกได้ถึง <b className="mono">{thaiDateTime(b.cancel_deadline)}</b></span>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                {b.status === "cancelled" && <span className="badge">ยกเลิกแล้ว</span>}
                {b.can_modify && (
                  <>
                    <Link href={`/bookings/${b.id}/edit`} className="btn btn-dark btn-sm">แก้ไข</Link>
                    <CancelBookingButton id={b.id} />
                  </>
                )}
                {b.status === "confirmed" && !b.is_past && !b.can_modify && (
                  <span className="small muted">เลยเวลาแก้ไข/ยกเลิกแล้ว ติดต่อร้านโดยตรง</span>
                )}
                {b.status === "confirmed" && b.is_past && (
                  <Link href={`/restaurants/${b.restaurant_id}#review`} className="btn btn-outline btn-sm">เขียนรีวิว</Link>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </main>
  );
}

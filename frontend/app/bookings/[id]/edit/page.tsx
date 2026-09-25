import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { Booking, RestaurantDetail } from "@/lib/types";
import BookingPanel from "@/components/BookingPanel";

type Props = { params: Promise<{ id: string }> };

export default async function EditBookingPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/login?next=/bookings/${id}/edit`);
  const b = await serverGet<Booking>(`/api/bookings/${id}`);
  if (!b) notFound();
  const r = await serverGet<RestaurantDetail>(`/api/restaurants/${b.restaurant_id}`);
  if (!r) notFound();

  return (
    <main className="container page" style={{ maxWidth: 520 }}>
      <nav className="small"><Link href="/bookings">← กลับไปการจองของฉัน</Link></nav>
      <div className="stack" style={{ gap: 2 }}>
        <span className="small muted">แก้ไขการจอง #{String(b.id).padStart(4, "0")}</span>
        <h1>{b.restaurant_name}</h1>
      </div>
      {b.can_modify ? (
        <BookingPanel restaurantId={r.id} seats={r.seats} cancelMinutes={r.cancel_minutes} loggedIn
          edit={{ bookingId: b.id, date: b.date, start: b.start, end: b.end, party: b.party }} />
      ) : (
        <div className="alert alert-info">การจองนี้แก้ไขไม่ได้แล้ว (ถูกยกเลิก หรือเลยเวลาที่ร้านกำหนด)</div>
      )}
    </main>
  );
}

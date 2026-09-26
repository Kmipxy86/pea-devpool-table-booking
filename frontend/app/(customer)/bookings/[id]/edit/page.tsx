import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { Booking, RestaurantDetail } from "@/lib/types";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import BookingPanel from "@/components/BookingPanel";

type Props = { params: Promise<{ id: string }> };

export default async function EditBookingPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/login?next=/bookings/${id}/edit`);
  const locale = await getLocale();
  const s = t[locale];
  const b = await serverGet<Booking>(`/api/bookings/${id}`);
  if (!b) notFound();
  const r = await serverGet<RestaurantDetail>(`/api/restaurants/${b.restaurant_id}`);
  if (!r) notFound();

  return (
    <main className="container page" style={{ maxWidth: 520 }}>
      <nav className="small"><Link href="/bookings">{s.backToBookings}</Link></nav>
      <div className="stack" style={{ gap: 2 }}>
        <span className="small muted">{s.editBookingNum(String(b.id).padStart(4, "0"))}</span>
        <h1>{b.restaurant_name}</h1>
      </div>
      {b.can_modify ? (
        <BookingPanel restaurantId={r.id} seats={r.seats} cancelMinutes={r.cancel_minutes} loggedIn locale={locale}
          edit={{ bookingId: b.id, date: b.date, start: b.start, end: b.end, party: b.party }} />
      ) : (
        <div className="alert alert-info">{s.cannotModify}</div>
      )}
    </main>
  );
}

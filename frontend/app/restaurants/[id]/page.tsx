import Link from "next/link";
import { notFound } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { RestaurantDetail } from "@/lib/types";
import { cancelLabel, thaiDateTime, WEEKDAYS } from "@/lib/format";
import BookingPanel from "@/components/BookingPanel";
import ReviewForm from "@/components/ReviewForm";
import Rating from "@/components/Stars";

type Props = { params: Promise<{ id: string }> };

export default async function RestaurantPage({ params }: Props) {
  const { id } = await params;
  const [r, me] = await Promise.all([serverGet<RestaurantDetail>(`/api/restaurants/${id}`), getMe()]);
  if (!r) notFound();

  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: r.reviews.filter((x) => x.rating === star).length }));
  const shown = r.reviews.length || 1;
  const imgs = r.images.slice(0, 3);

  return (
    <main className="container page">
      <nav aria-label="breadcrumb" className="small muted row" style={{ gap: 8 }}>
        <Link href="/" style={{ color: "var(--gray-600)" }}>ร้านทั้งหมด</Link><span>/</span><span style={{ color: "var(--ink)" }}>{r.name}</span>
      </nav>
      <div className="detail-layout">
        <section className="stack-lg">
          <div className={`gallery${imgs.length === 1 ? " single" : ""}`}>
            {imgs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={`รูปร้าน ${r.name} ${i + 1}`} />
            ))}
            {imgs.length === 2 && <div className="ph" />}
          </div>

          <div className="stack">
            <h1>{r.name}</h1>
            <div className="row small muted">
              <Rating value={r.rating} count={r.review_count} />
              <span>{r.review_count} รีวิว</span>
              {r.cuisine && <><span aria-hidden="true">·</span><span>{r.cuisine}</span></>}
              {r.location && <><span aria-hidden="true">·</span><span>{r.location}</span></>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="chip">เปิด <b className="mono">{r.open}–{r.close}</b>{r.overnight && <span className="badge badge-orange">ปิดวันถัดไป</span>}</span>
              <span className="chip"><b>{r.seats}</b> ที่นั่ง</span>
              <span className="chip">ยกเลิกได้ก่อนเวลาจอง <b>{cancelLabel(r.cancel_minutes)}</b></span>
              {r.closed_days.length > 0 && <span className="chip">หยุดทุกวัน<b>{r.closed_days.map((d) => WEEKDAYS[d]).join(", ")}</b></span>}
            </div>
            {r.description && <p style={{ color: "var(--gray-700)", lineHeight: 1.75 }}>{r.description}</p>}
          </div>

          <section className="card stack-lg" aria-labelledby="reviews-title">
            <h2 id="reviews-title">รีวิว</h2>
            <div className="row" style={{ gap: 32, alignItems: "center" }}>
              <div className="stack" style={{ gap: 0, alignItems: "center", width: 120 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 46, fontWeight: 600, lineHeight: 1.1 }}>{r.review_count ? r.rating.toFixed(1) : "–"}</span>
                <span className="xs muted">จาก {r.review_count} รีวิว</span>
              </div>
              <div className="stack" style={{ flex: 1, gap: 6, minWidth: 220 }}>
                {dist.map((d) => (
                  <div className="dist" key={d.star}>
                    <span style={{ width: 36 }}>{d.star} ดาว</span>
                    <span className="dist-bar"><span style={{ width: `${(d.count / shown) * 100}%` }} /></span>
                    <span className="mono" style={{ width: 24, textAlign: "right" }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {r.is_mine ? (
              <div className="alert alert-info">นี่คือร้านของคุณ รีวิวร้านของตัวเองไม่ได้</div>
            ) : me ? (
              <ReviewForm restaurantId={r.id} initial={r.my_review} />
            ) : (
              <div className="alert alert-info"><span><Link href={`/login?next=/restaurants/${r.id}`}>เข้าสู่ระบบ</Link> เพื่อเขียนรีวิว</span></div>
            )}

            <div>
              {r.reviews.length === 0 && <p className="muted small">ยังไม่มีรีวิว เป็นคนแรกที่รีวิวร้านนี้</p>}
              {r.reviews.map((rv) => (
                <article key={rv.id} className="review">
                  <div className="between">
                    <b>{rv.user_name}</b>
                    <span className="small"><span className="star">{"★".repeat(rv.rating)}</span><span style={{ color: "var(--gray-300)" }}>{"★".repeat(5 - rv.rating)}</span></span>
                  </div>
                  {rv.comment && <p style={{ color: "var(--gray-700)" }}>{rv.comment}</p>}
                  <span className="xs muted">{thaiDateTime(rv.created_at)}</span>
                </article>
              ))}
            </div>
          </section>
        </section>

        {r.is_mine ? (
          <aside className="panel">
            <h2>ร้านของคุณ</h2>
            <p className="muted small">เจ้าของร้านจองร้านตัวเองไม่ได้ ดูการจองและแก้ไขร้านได้ที่หน้าจัดการร้าน</p>
            <Link href={`/owner/${r.id}`} className="btn btn-dark btn-block">ดูการจองของร้าน</Link>
            <Link href={`/owner/${r.id}/edit`} className="btn btn-outline btn-block">แก้ไขร้าน</Link>
          </aside>
        ) : (
          <BookingPanel restaurantId={r.id} seats={r.seats} cancelMinutes={r.cancel_minutes} loggedIn={!!me} />
        )}
      </div>
    </main>
  );
}

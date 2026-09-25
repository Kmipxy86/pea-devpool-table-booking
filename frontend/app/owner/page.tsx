import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { Restaurant } from "@/lib/types";
import { cancelLabel } from "@/lib/format";
import Rating from "@/components/Stars";

export default async function OwnerPage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/owner");
  const list = (await serverGet<Restaurant[]>("/api/me/restaurants")) ?? [];

  return (
    <main className="container page">
      <div className="between">
        <div className="stack" style={{ gap: 2 }}>
          <h1>ร้านของฉัน</h1>
          <span className="muted small">ร้านที่คุณเป็นเจ้าของ แก้ไข ลบ และดูการจองได้ที่นี่</span>
        </div>
        <Link href="/owner/new" className="btn btn-primary">+ สร้างร้านใหม่</Link>
      </div>
      {list.length === 0 && (
        <div className="card empty">
          ยังไม่มีร้าน <Link href="/owner/new">สร้างร้านแรกของคุณ</Link>
        </div>
      )}
      {list.map((r) => (
        <article key={r.id} className="card card-tight owner-item">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.cover} alt="" />
          <div className="stack" style={{ gap: 2, flex: 1 }}>
            <div className="row"><Link href={`/owner/${r.id}`} style={{ color: "var(--ink)", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 21 }}>{r.name}</Link><Rating value={r.rating} count={r.review_count} /></div>
            <span className="small muted">{[r.cuisine, r.location].filter(Boolean).join(" · ")} · {r.seats} ที่นั่ง · <span className="mono">{r.open}–{r.close}</span> · ยกเลิกล่วงหน้า {cancelLabel(r.cancel_minutes)}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href={`/owner/${r.id}`} className="btn btn-dark btn-sm">ดูการจอง</Link>
            <Link href={`/owner/${r.id}/edit`} className="btn btn-outline btn-sm">แก้ไข</Link>
            <Link href={`/restaurants/${r.id}`} className="btn btn-ghost btn-sm">หน้าร้าน</Link>
          </div>
        </article>
      ))}
    </main>
  );
}

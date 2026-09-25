import Link from "next/link";
import type { Restaurant } from "@/lib/types";
import Rating from "./Stars";

export default function RestaurantCard({ r }: { r: Restaurant }) {
  return (
    <Link href={`/restaurants/${r.id}`} className="r-card">
      <div className="r-cover">
        {r.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.cover} alt={`รูปร้าน ${r.name}`} />
        )}
        {r.is_mine && <span className="badge badge-dark">ร้านของคุณ</span>}
      </div>
      <div className="r-body">
        <div className="between">
          <span className="r-name">{r.name}</span>
          <Rating value={r.rating} count={r.review_count} />
        </div>
        <span className="small muted">{[r.cuisine, r.location].filter(Boolean).join(" · ")}</span>
        <div className="r-meta">
          <span>{r.review_count} รีวิว</span>
          <span>{r.seats} ที่นั่ง</span>
          <span className="mono">{r.open}–{r.close}</span>
        </div>
      </div>
    </Link>
  );
}

import Link from "next/link";
import type { Restaurant } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import Rating from "./Stars";

export default function RestaurantCard({ r, locale }: { r: Restaurant; locale: Locale }) {
  const s = t[locale];
  return (
    <Link href={`/restaurants/${r.id}`} className="r-card">
      <div className="r-cover">
        {r.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.cover} alt={`รูปร้าน ${r.name}`} />
        )}
      </div>
      <div className="r-body">
        <div className="between">
          <span className="r-name">{r.name}</span>
          <Rating value={r.rating} count={r.review_count} locale={locale} />
        </div>
        <span className="small muted">{[r.cuisine, r.location].filter(Boolean).join(" · ")}</span>
        <div className="r-meta">
          <span>{s.reviewsCount(r.review_count)}</span>
          <span>{r.seats} {s.seatsSuffix}</span>
          <span className="mono">{r.open}–{r.close}</span>
        </div>
      </div>
    </Link>
  );
}

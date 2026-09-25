import { t, type Locale } from "@/lib/i18n";

export default function Rating({ value, count, locale }: { value: number; count?: number; locale: Locale }) {
  const s = t[locale];
  if (!count) return <span className="small muted">{s.noReviews}</span>;
  return (
    <span className="rating" aria-label={s.ratingLabel(value.toFixed(1))}>
      <span className="star" aria-hidden="true">★</span>
      {value.toFixed(1)}
    </span>
  );
}

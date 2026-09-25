"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { t, type Locale } from "@/lib/i18n";

export default function ReviewForm({ restaurantId, initial, locale }: { restaurantId: number; initial?: { rating: number; comment: string } | null; locale: Locale }) {
  const router = useRouter();
  const s = t[locale];
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) { setError(s.ratingRequired); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await api(`/api/restaurants/${restaurantId}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) });
      setSaved(true);
      router.refresh(); // ให้ค่าเฉลี่ยและรายการรีวิวบนหน้าอัปเดต
    } catch (err) {
      setError(err instanceof Error ? err.message : s.reviewSubmitFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="review" onSubmit={onSubmit} className="stack" style={{ padding: 18, borderRadius: 14, background: "var(--gray-50)", border: "1px solid var(--gray-200)" }}>
      <b>{initial ? s.editYourReview : s.rateThisPlace}</b>
      <div className="row" style={{ gap: 8 }}>
        <div className="stars-input" role="radiogroup" aria-label={s.ratingGroupAria}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={s.starsLabel(n)}
              className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
          ))}
        </div>
        <span className="small muted">{rating ? s.ratingSummary(rating) : s.notSelected}</span>
      </div>
      <label className="field">{s.reviewTextLabel}
        <textarea className="textarea" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={s.reviewPlaceholder} />
      </label>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {saved && <div className="alert alert-ok">{s.reviewSaved}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-dark" type="submit" disabled={saving}>{saving ? s.sending : initial ? s.saveReview : s.submitReview}</button>
      </div>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

export default function ReviewForm({ restaurantId, initial }: { restaurantId: number; initial?: { rating: number; comment: string } | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) { setError("กรุณาเลือกคะแนน 1–5 ดาว"); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await api(`/api/restaurants/${restaurantId}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) });
      setSaved(true);
      router.refresh(); // ให้ค่าเฉลี่ยและรายการรีวิวบนหน้าอัปเดต
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งรีวิวไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="review" onSubmit={onSubmit} className="stack" style={{ padding: 18, borderRadius: 14, background: "var(--gray-50)", border: "1px solid var(--gray-200)" }}>
      <b>{initial ? "แก้ไขรีวิวของคุณ" : "ให้คะแนนร้านนี้"}</b>
      <div className="row" style={{ gap: 8 }}>
        <div className="stars-input" role="radiogroup" aria-label="คะแนน">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ดาว`}
              className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
          ))}
        </div>
        <span className="small muted">{rating ? `${rating} จาก 5 ดาว` : "ยังไม่ได้เลือก"}</span>
      </div>
      <label className="field">ข้อความรีวิว
        <textarea className="textarea" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="เล่าประสบการณ์ของคุณ อาหาร บรรยากาศ การบริการ" />
      </label>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {saved && <div className="alert alert-ok">บันทึกรีวิวแล้ว ขอบคุณครับ</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-dark" type="submit" disabled={saving}>{saving ? "กำลังส่ง..." : initial ? "บันทึกรีวิว" : "ส่งรีวิว"}</button>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { RestaurantDetail } from "@/lib/types";
import { toMinutes, weekdayLabel } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

export default function RestaurantForm({ initial, locale }: { initial?: RestaurantDetail; locale: Locale }) {
  const router = useRouter();
  const s = t[locale];
  const CANCEL_OPTIONS = [
    { v: 30, label: s.cancelOption30 },
    { v: 60, label: s.cancelOption60 },
    { v: 120, label: s.cancelOption120 },
    { v: 180, label: s.cancelOption180 },
    { v: 1440, label: s.cancelOption1440 },
  ];
  const [name, setName] = useState(initial?.name ?? "");
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [seats, setSeats] = useState(String(initial?.seats ?? 10));
  const [open, setOpen] = useState(initial?.open ?? "10:00");
  const [close, setClose] = useState(initial?.close ?? "22:00");
  const [closedDays, setClosedDays] = useState<number[]>(initial?.closed_days ?? []);
  const [cancelMinutes, setCancelMinutes] = useState(initial?.cancel_minutes ?? 30);
  const [limitedPct, setLimitedPct] = useState(initial?.limited_pct ?? 20);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const overnight = open && close && toMinutes(close) <= toMinutes(open);
  const cancelOptions = CANCEL_OPTIONS.some((o) => o.v === cancelMinutes)
    ? CANCEL_OPTIONS
    : [...CANCEL_OPTIONS, { v: cancelMinutes, label: s.cancelOptionCustom(cancelMinutes) }];

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const { url } = await api<{ url: string }>("/api/uploads", { method: "POST", body: fd });
        setImages((prev) => [...prev, url]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : s.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  function toggleDay(d: number) {
    setClosedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (images.length === 0) { setError(s.needOnePhoto); return; }
    setSaving(true);
    setError("");
    const body = JSON.stringify({
      name, cuisine, location, description, seats: Number(seats), open, close,
      closed_days: closedDays, cancel_minutes: cancelMinutes, limited_pct: limitedPct, images,
    });
    try {
      const saved = initial
        ? await api<RestaurantDetail>(`/api/restaurants/${initial.id}`, { method: "PUT", body })
        : await api<RestaurantDetail>("/api/restaurants", { method: "POST", body });
      router.push(`/owner/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.saveFailed);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-lg">
      <section className="card stack">
        <h2 style={{ fontSize: 19 }}>{s.restaurantInfoTitle}</h2>
        <label className="field">{s.nameLabel}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <div className="grid-2">
          <label className="field">{s.cuisineLabel}
            <input className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder={s.cuisinePlaceholder} />
          </label>
          <label className="field">{s.locationLabel}
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={s.locationPlaceholder} />
          </label>
        </div>
        <label className="field">{s.descriptionLabel}
          <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={s.descriptionPlaceholder} />
        </label>
      </section>

      <section className="card stack">
        <div className="between"><h2 style={{ fontSize: 19 }}>{s.photosTitle}</h2><span className="xs muted">{s.photosHint}</span></div>
        <div className="img-grid">
          {images.map((src, i) => (
            <div key={src} className="img-tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`รูปที่ ${i + 1}`} />
              {i === 0 && <span className="badge badge-dark">{s.mainPhoto}</span>}
              <div className="tile-actions">
                {i > 0 && <button type="button" onClick={() => setImages((p) => [src, ...p.filter((x) => x !== src)])}>{s.setAsMain}</button>}
                <button type="button" onClick={() => setImages((p) => p.filter((x) => x !== src))} aria-label={s.deletePhotoAria(i + 1)}>{s.deleteBtn}</button>
              </div>
            </div>
          ))}
          {images.length < 10 && (
            <label className="upload-tile">
              <span style={{ fontSize: 24, color: "var(--orange-700)" }}>+</span>
              {uploading ? s.uploading : s.addPhoto}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={onUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          )}
        </div>
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 19 }}>{s.seatingTitle}</h2>
        <div className="grid-3">
          <label className="field">{s.seatsCountLabel}
            <input className="input" type="number" min={1} max={1000} value={seats} onChange={(e) => setSeats(e.target.value)} required />
            <span className="hint">{s.seatsHint}</span>
          </label>
          <label className="field">{s.cancelAdvanceLabel}
            <select className="select" value={cancelMinutes} onChange={(e) => setCancelMinutes(Number(e.target.value))}>
              {cancelOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
            <span className="hint">{s.cancelHint}</span>
          </label>
          <label className="field">{s.limitedSeatsLabel}
            <select className="select" value={limitedPct} onChange={(e) => setLimitedPct(Number(e.target.value))}>
              {[0, 10, 20, 30, 50].map((p) => <option key={p} value={p}>{p === 0 ? s.limitedNone : s.limitedPct(p)}</option>)}
            </select>
            <span className="hint">{s.limitedHint}</span>
          </label>
        </div>
      </section>

      <section className="card stack">
        <div className="between"><h2 style={{ fontSize: 19 }}>{s.hoursTitle}</h2><span className="xs muted">{s.hoursHint}</span></div>
        <div className="row">
          <label className="field">{s.openLabel}<input className="input mono" type="time" value={open} onChange={(e) => setOpen(e.target.value)} required style={{ width: 140 }} /></label>
          <label className="field">{s.closeLabel}<input className="input mono" type="time" value={close} onChange={(e) => setClose(e.target.value)} required style={{ width: 140 }} /></label>
          {overnight && <span className="badge badge-orange" style={{ alignSelf: "flex-end", marginBottom: 12 }}>{s.overnightBadge}</span>}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 600 }}>{s.openDaysLabel}</span>
          <div className="day-row">
            {Array.from({ length: 7 }, (_, i) => i).map((i) => {
              const isOpen = !closedDays.includes(i);
              return (
                <label key={i} className={`day-check${isOpen ? "" : " off"}`}>
                  <input type="checkbox" checked={isOpen} onChange={() => toggleDay(i)} />{weekdayLabel(i, locale)}
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="between">
        <Link href={initial ? `/owner/${initial.id}` : "/owner"} className="btn btn-outline">{s.formCancel}</Link>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>{saving ? s.saving : initial ? s.saveEdit : s.createRestaurantBtn}</button>
      </div>
    </form>
  );
}

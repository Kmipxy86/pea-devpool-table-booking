"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { RestaurantDetail } from "@/lib/types";
import { toMinutes, WEEKDAYS } from "@/lib/format";

const CANCEL_OPTIONS = [
  { v: 30, label: "30 นาที (ค่าเริ่มต้น)" },
  { v: 60, label: "1 ชั่วโมง" },
  { v: 120, label: "2 ชั่วโมง" },
  { v: 180, label: "3 ชั่วโมง" },
  { v: 1440, label: "1 วัน" },
];

export default function RestaurantForm({ initial }: { initial?: RestaurantDetail }) {
  const router = useRouter();
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
    : [...CANCEL_OPTIONS, { v: cancelMinutes, label: `${cancelMinutes} นาที` }];

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
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  function toggleDay(d: number) {
    setClosedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (images.length === 0) { setError("ต้องมีรูปร้านอย่างน้อย 1 รูป"); return; }
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
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-lg">
      <section className="card stack">
        <h2 style={{ fontSize: 19 }}>ข้อมูลร้าน</h2>
        <label className="field">ชื่อร้าน
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <div className="grid-2">
          <label className="field">ประเภทอาหาร
            <input className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="เช่น อาหารไทย ก๋วยเตี๋ยว" />
          </label>
          <label className="field">ที่ตั้ง / ย่าน
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="เช่น สามย่าน" />
          </label>
        </div>
        <label className="field">รายละเอียด
          <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="สิ่งที่ลูกค้าควรรู้ เช่น เมนูเด่น ที่จอดรถ" />
        </label>
      </section>

      <section className="card stack">
        <div className="between"><h2 style={{ fontSize: 19 }}>รูปร้าน</h2><span className="xs muted">อย่างน้อย 1 รูป · รูปแรกคือรูปหลัก · JPG/PNG/WEBP ไม่เกิน 5 MB</span></div>
        <div className="img-grid">
          {images.map((src, i) => (
            <div key={src} className="img-tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`รูปที่ ${i + 1}`} />
              {i === 0 && <span className="badge badge-dark">รูปหลัก</span>}
              <div className="tile-actions">
                {i > 0 && <button type="button" onClick={() => setImages((p) => [src, ...p.filter((x) => x !== src)])}>ตั้งเป็นรูปหลัก</button>}
                <button type="button" onClick={() => setImages((p) => p.filter((x) => x !== src))} aria-label={`ลบรูปที่ ${i + 1}`}>ลบ</button>
              </div>
            </div>
          ))}
          {images.length < 10 && (
            <label className="upload-tile">
              <span style={{ fontSize: 24, color: "var(--orange-700)" }}>+</span>
              {uploading ? "กำลังอัปโหลด..." : "เพิ่มรูป"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={onUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          )}
        </div>
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 19 }}>ที่นั่งและการจอง</h2>
        <div className="grid-3">
          <label className="field">จำนวนที่นั่ง
            <input className="input" type="number" min={1} max={1000} value={seats} onChange={(e) => setSeats(e.target.value)} required />
            <span className="hint">นับเป็นที่นั่ง ไม่แยกโต๊ะ</span>
          </label>
          <label className="field">ยกเลิกล่วงหน้า
            <select className="select" value={cancelMinutes} onChange={(e) => setCancelMinutes(Number(e.target.value))}>
              {cancelOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
            <span className="hint">ตั้งต่ำกว่า 30 นาทีไม่ได้</span>
          </label>
          <label className="field">ป้าย Limited Seats
            <select className="select" value={limitedPct} onChange={(e) => setLimitedPct(Number(e.target.value))}>
              {[0, 10, 20, 30, 50].map((p) => <option key={p} value={p}>{p === 0 ? "ไม่แสดง" : `เหลือ ≤ ${p}%`}</option>)}
            </select>
            <span className="hint">ขึ้นป้ายเมื่อช่วงเวลาใกล้เต็ม</span>
          </label>
        </div>
      </section>

      <section className="card stack">
        <div className="between"><h2 style={{ fontSize: 19 }}>เวลาเปิด–ปิด</h2><span className="xs muted">เวลาปิดน้อยกว่าเวลาเปิด = ปิดวันถัดไป</span></div>
        <div className="row">
          <label className="field">เปิด<input className="input mono" type="time" value={open} onChange={(e) => setOpen(e.target.value)} required style={{ width: 140 }} /></label>
          <label className="field">ปิด<input className="input mono" type="time" value={close} onChange={(e) => setClose(e.target.value)} required style={{ width: 140 }} /></label>
          {overnight && <span className="badge badge-orange" style={{ alignSelf: "flex-end", marginBottom: 12 }}>ปิด +1 วัน (เปิดข้ามเที่ยงคืน)</span>}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 600 }}>วันที่เปิด (เอาเครื่องหมายออก = วันหยุด)</span>
          <div className="day-row">
            {WEEKDAYS.map((d, i) => {
              const isOpen = !closedDays.includes(i);
              return (
                <label key={d} className={`day-check${isOpen ? "" : " off"}`}>
                  <input type="checkbox" checked={isOpen} onChange={() => toggleDay(i)} />{d}
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="between">
        <Link href={initial ? `/owner/${initial.id}` : "/owner"} className="btn btn-outline">ยกเลิก</Link>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>{saving ? "กำลังบันทึก..." : initial ? "บันทึกการแก้ไข" : "สร้างร้าน"}</button>
      </div>
    </form>
  );
}

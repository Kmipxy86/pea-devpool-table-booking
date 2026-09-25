"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import type { Availability, Booking } from "@/lib/types";
import { addDays, cancelLabel, thaiDate, thaiDateTime, todayBangkok } from "@/lib/format";

type Props = {
  restaurantId: number;
  seats: number;
  cancelMinutes: number;
  loggedIn: boolean;
  // ถ้าส่ง edit มา = โหมดแก้ไขการจองเดิม
  edit?: { bookingId: number; date: string; start: string; end: string; party: number };
};

const BAR_PX = 100; // ความสูงของแท่งเมื่อที่นั่งเต็มพอดี (ตำแหน่งเส้นประ)
const BOX_PX = 150; // ความสูงกล่องกราฟทั้งหมด

// Client Component: มี state (วัน เวลา จำนวนคน) และต้องตอบสนองทันทีที่ผู้ใช้กด
// หน้าเว็บตรวจที่นั่งก่อนเพื่อให้ผู้ใช้เห็นผลเร็ว แต่ "คำตัดสินจริง" อยู่ที่ Go เสมอ
export default function BookingPanel({ restaurantId, seats, cancelMinutes, loggedIn, edit }: Props) {
  const router = useRouter();
  const today = todayBangkok();
  const [date, setDate] = useState(edit?.date ?? today);
  const [party, setParty] = useState(edit?.party ?? 2);
  const [startIdx, setStartIdx] = useState(-1);
  const [endIdx, setEndIdx] = useState(-1); // ไม่รวมตัวเอง: ช่วงที่เลือก = slots[startIdx .. endIdx-1]
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState<Booking | null>(null);
  const appliedEdit = useRef(false);

  // โหลดความว่างของวันที่เลือก (โหมดแก้ไขส่ง exclude เพื่อไม่นับที่นั่งเดิมของเราซ้ำ)
  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    const qs = new URLSearchParams({ date });
    if (edit) qs.set("exclude", String(edit.bookingId));
    api<Availability>(`/api/restaurants/${restaurantId}/availability?${qs}`)
      .then((a) => { if (!cancelled) setAvail(a); })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [date, restaurantId, edit, reloadKey]);

  // เลือกช่วงเวลาเริ่มต้นให้ เมื่อได้ข้อมูลวันใหม่
  useEffect(() => {
    if (!avail) return;
    const slots = avail.slots;
    if (edit && !appliedEdit.current && avail.date === edit.date) {
      appliedEdit.current = true;
      const s = slots.findIndex((x) => x.start === edit.start);
      const e = slots.findIndex((x, i) => i >= s && x.end === edit.end);
      if (s >= 0 && e >= s) {
        setStartIdx(s);
        setEndIdx(e + 1);
        return;
      }
    }
    const keep = startIdx >= 0 && startIdx < slots.length && !slots[startIdx].past;
    const s = keep ? startIdx : slots.findIndex((x) => !x.past);
    const e = s >= 0 && endIdx > s && endIdx <= slots.length ? endIdx : s >= 0 ? Math.min(s + 2, slots.length) : -1;
    setStartIdx(s);
    setEndIdx(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail]);

  const slots = avail?.slots ?? [];
  const range = startIdx >= 0 && endIdx > startIdx ? slots.slice(startIdx, endIdx) : [];
  const over = range.find((s) => s.used + party > seats);
  const remaining = range.length ? Math.min(...range.map((s) => seats - s.used)) : 0;
  const hasPast = range.some((s) => s.past);
  const valid = range.length > 0 && !over && !hasPast;
  const limited = valid && !!avail && remaining <= avail.limited_threshold;
  const startTime = range[0]?.start;
  const endTime = range[range.length - 1]?.end;

  function pickStart(i: number) {
    const dur = endIdx > startIdx ? endIdx - startIdx : 2;
    setStartIdx(i);
    setEndIdx(Math.min(i + dur, slots.length));
    setServerError("");
  }

  async function submit() {
    if (!valid || !startTime || !endTime) return;
    setSubmitting(true);
    setServerError("");
    const body = JSON.stringify({ restaurant_id: restaurantId, date, start: startTime, end: endTime, party });
    try {
      const b = edit
        ? await api<Booking>(`/api/bookings/${edit.bookingId}`, { method: "PUT", body })
        : await api<Booking>("/api/bookings", { method: "POST", body });
      setDone(b);
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "จองไม่สำเร็จ");
      // 409 = มีคนจองตัดหน้า โหลดความว่างล่าสุดมาแสดงใหม่
      if (err instanceof ApiError && err.status === 409) setReloadKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <aside className="panel" aria-live="polite">
        <div className="row">
          <span className="badge badge-orange" style={{ fontSize: 14, padding: "6px 12px" }}>✓</span>
          <div className="stack" style={{ gap: 0 }}>
            <h2>{edit ? "บันทึกการแก้ไขแล้ว" : "จองสำเร็จ"}</h2>
            <span className="small muted">ร้านได้รับการจองของคุณแล้ว</span>
          </div>
        </div>
        <div className="ticket">
          <div className="ticket-head"><b style={{ fontFamily: "var(--font-display)", fontSize: 19 }}>{done.restaurant_name}</b><span className="mono small muted">#{String(done.id).padStart(4, "0")}</span></div>
          <div className="ticket-row"><span>วันที่</span><b>{thaiDate(done.date)}</b></div>
          <div className="ticket-row"><span>เวลา</span><b className="mono">{done.start}–{done.end}</b></div>
          <div className="ticket-row"><span>จำนวน</span><b>{done.party} คน</b></div>
          <div className="ticket-row"><span>ยกเลิกได้ถึง</span><b className="mono">{thaiDateTime(done.cancel_deadline)}</b></div>
        </div>
        <Link href="/bookings" className="btn btn-dark btn-lg btn-block">ดูการจองของฉัน</Link>
        {!edit && <button type="button" className="btn btn-outline btn-block" onClick={() => { setDone(null); setReloadKey((k) => k + 1); }}>จองเพิ่ม</button>}
      </aside>
    );
  }

  const dayChoices = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <aside className="panel">
      <div className="between">
        <h2>{edit ? "แก้ไขการจอง" : "จองโต๊ะ"}</h2>
        <span className="small muted">ร้านมี {seats} ที่นั่ง</span>
      </div>

      <div className="between">
        <span style={{ fontWeight: 600 }}>จำนวนคน</span>
        <div className="stepper">
          <button type="button" aria-label="ลดจำนวนคน" disabled={party <= 1} onClick={() => setParty((p) => p - 1)}>−</button>
          <span aria-live="polite">{party} คน</span>
          <button type="button" aria-label="เพิ่มจำนวนคน" disabled={party >= seats} onClick={() => setParty((p) => p + 1)}>+</button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span style={{ fontWeight: 600 }}>วันที่</span>
        <div className="row" style={{ gap: 6 }}>
          {dayChoices.map((d, i) => (
            <button key={d} type="button" onClick={() => setDate(d)}
              className={`btn btn-sm ${d === date ? "btn-dark" : "btn-outline"}`} style={{ padding: "0 10px" }}>
              {i === 0 ? "วันนี้" : thaiDate(d, { month: undefined })}
            </button>
          ))}
        </div>
        <input className="input" type="date" value={date} min={today} aria-label="เลือกวันอื่น"
          onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>

      {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
      {avail?.closed && <div className="alert alert-info">ร้านปิดในวันที่เลือก ลองเลือกวันอื่น</div>}

      {avail && !avail.closed && slots.length > 0 && (
        <>
          <div className="grid-2">
            <label className="field">เวลาเริ่ม
              <select className="select mono" value={startIdx} onChange={(e) => pickStart(Number(e.target.value))}>
                {slots.map((s, i) => <option key={s.start} value={i} disabled={s.past}>{s.start}{s.past ? " (ผ่านแล้ว)" : ""}</option>)}
              </select>
            </label>
            <label className="field">เวลาสิ้นสุด
              <select className="select mono" value={endIdx} onChange={(e) => { setEndIdx(Number(e.target.value)); setServerError(""); }}>
                {slots.map((s, i) => i >= startIdx ? <option key={s.end} value={i + 1}>{s.end}</option> : null)}
              </select>
            </label>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <span className="xs muted">แตะแท่งเพื่อเลือกเวลาเริ่ม · แต่ละแท่ง = 30 นาที</span>
            <div className="timeline-wrap">
              <div className="timeline">
                {slots.map((s, i) => {
                  const inRange = i >= startIdx && i < endIdx;
                  const usedH = Math.min((s.used / seats) * BAR_PX, BOX_PX);
                  const reqH = inRange ? Math.min((party / seats) * BAR_PX, BOX_PX - usedH) : 0;
                  return (
                    <button key={s.start} type="button" disabled={s.past} onClick={() => pickStart(i)}
                      className={`bar${inRange ? " in" : ""}${s.past ? " past" : ""}`}
                      aria-label={`${s.start} จองแล้ว ${s.used} จาก ${seats} ที่${s.past ? " (ผ่านไปแล้ว)" : ""}`}
                      title={`${s.start}–${s.end} · จองแล้ว ${s.used}/${seats}`}>
                      <span className={`req${inRange && s.used + party > seats ? " over" : ""}`} style={{ height: reqH }} />
                      <span className="used" style={{ height: usedH }} />
                    </button>
                  );
                })}
              </div>
              <div className="cap-line" style={{ bottom: BAR_PX }} />
            </div>
            <div className="tl-labels">
              {slots.map((s, i) => <span key={s.start}>{i % 4 === 0 ? s.start : ""}</span>)}
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--gray-300)" }} />จองแล้ว</span>
              <span><i style={{ background: "var(--orange-500)" }} />ของคุณ</span>
              <span><i style={{ background: "var(--ink)" }} />เกินที่นั่ง</span>
              <span><i style={{ width: 14, height: 0, borderTop: "2px dashed var(--ink)", borderRadius: 0 }} />{seats} ที่นั่ง</span>
            </div>
          </div>

          {over ? (
            <div className="alert alert-error" role="alert">
              ช่วง {over.start}–{over.end} จองแล้ว {over.used} คน + คุณ {party} คน = {over.used + party} เกิน {seats} ที่นั่ง ลองลดจำนวนคนหรือเลือกเวลาอื่น
            </div>
          ) : valid ? (
            <div className="alert alert-info between">
              <span>ว่าง — ช่วงนี้เหลือ {remaining} ที่นั่ง</span>
              {limited && <span className="badge badge-orange">Limited Seats Left!</span>}
            </div>
          ) : null}

          {startTime && endTime && (
            <div className="ticket">
              <div className="ticket-row"><span>วันที่</span><b>{thaiDate(date)}</b></div>
              <div className="ticket-row"><span>เวลา</span><b className="mono">{startTime}–{endTime}</b></div>
              <div className="ticket-row"><span>จำนวน</span><b>{party} คน</b></div>
              <div className="ticket-row"><span>ยกเลิกได้</span><b>ก่อนเวลาจอง {cancelLabel(cancelMinutes)}</b></div>
            </div>
          )}

          {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}

          {!loggedIn ? (
            <Link href={`/login?next=/restaurants/${restaurantId}`} className="btn btn-dark btn-lg btn-block">เข้าสู่ระบบเพื่อจอง</Link>
          ) : (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!valid || submitting} onClick={submit}>
              {submitting ? "กำลังบันทึก..." : over ? "ที่นั่งไม่พอในช่วงที่เลือก" : edit ? "บันทึกการแก้ไข" : "ยืนยันการจอง"}
            </button>
          )}
        </>
      )}
      {avail && !avail.closed && slots.length > 0 && slots.every((s) => s.past) && (
        <div className="alert alert-info">วันนี้เลยเวลาเปิดร้านแล้ว ลองเลือกวันถัดไป</div>
      )}
    </aside>
  );
}

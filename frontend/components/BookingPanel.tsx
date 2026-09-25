"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import type { Availability, Booking } from "@/lib/types";
import { addDays, cancelLabel, thaiDate, thaiDateTime, todayBangkok } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

type Props = {
  restaurantId: number;
  seats: number;
  cancelMinutes: number;
  loggedIn: boolean;
  locale: Locale;
  // ถ้าส่ง edit มา = โหมดแก้ไขการจองเดิม
  edit?: { bookingId: number; date: string; start: string; end: string; party: number };
};

const BAR_PX = 100; // ความสูงของแท่งเมื่อที่นั่งเต็มพอดี (ตำแหน่งเส้นประ)
const BOX_PX = 150; // ความสูงกล่องกราฟทั้งหมด

// Client Component: มี state (วัน เวลา จำนวนคน) และต้องตอบสนองทันทีที่ผู้ใช้กด
// หน้าเว็บตรวจที่นั่งก่อนเพื่อให้ผู้ใช้เห็นผลเร็ว แต่ "คำตัดสินจริง" อยู่ที่ Go เสมอ
export default function BookingPanel({ restaurantId, seats, cancelMinutes, loggedIn, locale, edit }: Props) {
  const router = useRouter();
  const s = t[locale];
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
  const over = range.find((sl) => sl.used + party > seats);
  const remaining = range.length ? Math.min(...range.map((sl) => seats - sl.used)) : 0;
  const hasPast = range.some((sl) => sl.past);
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
      setServerError(err instanceof Error ? err.message : s.bookingFailed);
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
            <h2>{edit ? s.savedEditTitle : s.bookedTitle}</h2>
            <span className="small muted">{s.receivedSubtitle}</span>
          </div>
        </div>
        <div className="ticket">
          <div className="ticket-head"><b style={{ fontFamily: "var(--font-display)", fontSize: 19 }}>{done.restaurant_name}</b><span className="mono small muted">#{String(done.id).padStart(4, "0")}</span></div>
          <div className="ticket-row"><span>{s.dateLabel}</span><b>{thaiDate(done.date, {}, locale)}</b></div>
          <div className="ticket-row"><span>{s.timeLabel}</span><b className="mono">{done.start}–{done.end}</b></div>
          <div className="ticket-row"><span>{s.partyLabel}</span><b>{done.party} {s.partySuffix}</b></div>
          <div className="ticket-row"><span>{s.cancelUntil}</span><b className="mono">{thaiDateTime(done.cancel_deadline, locale)}</b></div>
        </div>
        <Link href="/bookings" className="btn btn-dark btn-lg btn-block">{s.viewMyBookings}</Link>
        {!edit && <button type="button" className="btn btn-outline btn-block" onClick={() => { setDone(null); setReloadKey((k) => k + 1); }}>{s.bookMore}</button>}
      </aside>
    );
  }

  const dayChoices = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <aside className="panel">
      <div className="between">
        <h2>{edit ? s.editBookingTitle : s.bookTableTitle}</h2>
        <span className="small muted">{s.seatsAvailableNote(seats)}</span>
      </div>

      <div className="between">
        <span style={{ fontWeight: 600 }}>{s.partyCountLabel}</span>
        <div className="stepper">
          <button type="button" aria-label={s.decreaseAria} disabled={party <= 1} onClick={() => setParty((p) => p - 1)}>−</button>
          <span aria-live="polite">{party} {s.partySuffix}</span>
          <button type="button" aria-label={s.increaseAria} disabled={party >= seats} onClick={() => setParty((p) => p + 1)}>+</button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{s.dateLabel}</span>
        <div className="row" style={{ gap: 6 }}>
          {dayChoices.map((d, i) => (
            <button key={d} type="button" onClick={() => setDate(d)}
              className={`btn btn-sm ${d === date ? "btn-dark" : "btn-outline"}`} style={{ padding: "0 10px" }}>
              {i === 0 ? s.todayLabel : thaiDate(d, { month: undefined }, locale)}
            </button>
          ))}
        </div>
        <input className="input" type="date" value={date} min={today} aria-label={s.pickAnotherDateAria}
          onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>

      {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
      {avail?.closed && <div className="alert alert-info">{s.closedThisDay}</div>}

      {avail && !avail.closed && slots.length > 0 && (
        <>
          <div className="grid-2">
            <label className="field">{s.startTimeLabel}
              <select className="select mono" value={startIdx} onChange={(e) => pickStart(Number(e.target.value))}>
                {slots.map((sl, i) => <option key={sl.start} value={i} disabled={sl.past}>{sl.start}{sl.past ? s.pastSuffix : ""}</option>)}
              </select>
            </label>
            <label className="field">{s.endTimeLabel}
              <select className="select mono" value={endIdx} onChange={(e) => { setEndIdx(Number(e.target.value)); setServerError(""); }}>
                {slots.map((sl, i) => i >= startIdx ? <option key={sl.end} value={i + 1}>{sl.end}</option> : null)}
              </select>
            </label>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <span className="xs muted">{s.tapToSelectHint}</span>
            <div className="timeline-wrap">
              <div className="timeline">
                {slots.map((sl, i) => {
                  const inRange = i >= startIdx && i < endIdx;
                  const usedH = Math.min((sl.used / seats) * BAR_PX, BOX_PX);
                  const reqH = inRange ? Math.min((party / seats) * BAR_PX, BOX_PX - usedH) : 0;
                  return (
                    <button key={sl.start} type="button" disabled={sl.past} onClick={() => pickStart(i)}
                      className={`bar${inRange ? " in" : ""}${sl.past ? " past" : ""}`}
                      aria-label={s.barAriaLabel(sl.start, sl.used, seats, sl.past ? s.pastSuffix : "")}
                      title={s.barTitle(sl.start, sl.end, sl.used, seats)}>
                      <span className={`req${inRange && sl.used + party > seats ? " over" : ""}`} style={{ height: reqH }} />
                      <span className="used" style={{ height: usedH }} />
                    </button>
                  );
                })}
              </div>
              <div className="cap-line" style={{ bottom: BAR_PX }} />
            </div>
            <div className="tl-labels">
              {slots.map((sl, i) => <span key={sl.start}>{i % 4 === 0 ? sl.start : ""}</span>)}
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--gray-300)" }} />{s.legendBooked}</span>
              <span><i style={{ background: "var(--orange-500)" }} />{s.legendYours}</span>
              <span><i style={{ background: "var(--ink)" }} />{s.legendOverCapacity}</span>
              <span><i style={{ width: 14, height: 0, borderTop: "2px dashed var(--ink)", borderRadius: 0 }} />{s.seatsLegend(seats)}</span>
            </div>
          </div>

          {over ? (
            <div className="alert alert-error" role="alert">
              {s.overCapacityMsg(over.start, over.end, over.used, party, over.used + party, seats)}
            </div>
          ) : valid ? (
            <div className="alert alert-info between">
              <span>{s.availableMsg(remaining)}</span>
              {limited && <span className="badge badge-orange">Limited Seats Left!</span>}
            </div>
          ) : null}

          {startTime && endTime && (
            <div className="ticket">
              <div className="ticket-row"><span>{s.dateLabel}</span><b>{thaiDate(date, {}, locale)}</b></div>
              <div className="ticket-row"><span>{s.timeLabel}</span><b className="mono">{startTime}–{endTime}</b></div>
              <div className="ticket-row"><span>{s.partyLabel}</span><b>{party} {s.partySuffix}</b></div>
              <div className="ticket-row"><span>{s.cancelableUntilPrefix}</span><b>{s.cancelableBeforeTime(cancelLabel(cancelMinutes, locale))}</b></div>
            </div>
          )}

          {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}

          {!loggedIn ? (
            <Link href={`/login?next=/restaurants/${restaurantId}`} className="btn btn-dark btn-lg btn-block">{s.loginToBook}</Link>
          ) : (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!valid || submitting} onClick={submit}>
              {submitting ? s.saving : over ? s.notEnoughSeats : edit ? s.saveEdit : s.confirmBookingBtn}
            </button>
          )}
        </>
      )}
      {avail && !avail.closed && slots.length > 0 && slots.every((sl) => sl.past) && (
        <div className="alert alert-info">{s.pastTodayMsg}</div>
      )}
    </aside>
  );
}

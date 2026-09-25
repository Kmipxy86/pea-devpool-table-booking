const TZ = "Asia/Bangkok";

// วันนี้ตามเวลาไทย ในรูปแบบ YYYY-MM-DD (en-CA ให้รูปแบบนี้พอดี)
export function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00+07:00");
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function thaiDate(date: string, opts: Intl.DateTimeFormatOptions = {}, locale: "th" | "en" = "th"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "th-TH", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short", ...opts,
  }).format(new Date(date + "T12:00:00+07:00"));
}

export function thaiDateTime(iso: string, locale: "th" | "en" = "th"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "th-TH", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function cancelLabel(minutes: number, locale: "th" | "en" = "th"): string {
  if (locale === "en") {
    if (minutes % 1440 === 0) { const d = minutes / 1440; return `${d} day${d === 1 ? "" : "s"}`; }
    if (minutes % 60 === 0) { const h = minutes / 60; return `${h} hour${h === 1 ? "" : "s"}`; }
    return `${minutes} minutes`;
  }
  if (minutes % 1440 === 0) return `${minutes / 1440} วัน`;
  if (minutes % 60 === 0) return `${minutes / 60} ชั่วโมง`;
  return `${minutes} นาที`;
}

export const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabel(i: number, locale: "th" | "en" = "th"): string {
  return (locale === "en" ? WEEKDAYS_EN : WEEKDAYS)[i];
}

// รับเฉพาะ path ภายในเว็บเรา กันการพาไปเว็บอื่น (open redirect)
export function safeNext(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

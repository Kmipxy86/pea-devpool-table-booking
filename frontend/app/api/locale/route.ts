import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n";

// สลับภาษา th/en เก็บไว้ใน cookie อ่านได้ทั้งฝั่ง server (Header, page ต่าง ๆ) และ client
export async function POST(req: NextRequest) {
  const { locale } = await req.json();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, locale === "en" ? "en" : "th", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

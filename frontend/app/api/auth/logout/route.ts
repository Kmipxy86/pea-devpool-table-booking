import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/session";

// เคลียร์ session ฝั่ง Next.js เท่านั้น ไม่ไล่ไปฆ่า SSO session ที่ Keycloak
// (คงพฤติกรรมเดิม: กดออกจากระบบแล้วอยู่หน้าเดิม ไม่เด้งออกนอกแอป)
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res.cookies);
  return res;
}

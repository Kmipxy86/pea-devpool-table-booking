import { NextRequest, NextResponse } from "next/server";
import { authEndpoint, COOKIE, cookieOpts, startPkceRedirect } from "@/lib/session";
import { safeNext } from "@/lib/format";

// เริ่ม PKCE flow: สร้าง code_verifier + state แล้วพาไปหน้า login ของ Keycloak
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next") ?? undefined);
  // บังคับให้ Keycloak โชว์ฟอร์ม login ทุกครั้ง แม้จะมี SSO session ค้างจากบัญชีก่อนหน้า
  // (จำเป็นสำหรับสลับบัญชีทดสอบ — ปกติ Keycloak จะ auto-login ด้วย session เดิมโดยไม่ถามซ้ำ)
  const { url, verifier, state } = await startPkceRedirect(authEndpoint(), req.nextUrl.origin, next, { prompt: "login" });

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE.pkce, JSON.stringify({ verifier, state, next }), cookieOpts(300));
  return res;
}

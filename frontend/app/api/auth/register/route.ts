import { NextRequest, NextResponse } from "next/server";
import { registerEndpoint, COOKIE, cookieOpts, startPkceRedirect } from "@/lib/session";
import { safeNext } from "@/lib/format";

// เริ่ม PKCE flow เหมือน /api/auth/login แต่พาไปหน้าสมัครสมาชิกของ Keycloak โดยตรง
// (ต้องเปิด registrationAllowed ไว้ใน realm ก่อน ดู keycloak/tablebook-realm.json)
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next") ?? undefined);
  const { url, verifier, state } = await startPkceRedirect(registerEndpoint(), req.nextUrl.origin, next);

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE.pkce, JSON.stringify({ verifier, state, next }), cookieOpts(300));
  return res;
}

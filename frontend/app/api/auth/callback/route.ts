import { NextRequest, NextResponse } from "next/server";
import { applyTokenSet, COOKIE, cookieOpts, exchangeCode } from "@/lib/session";

// Keycloak redirect กลับมาที่นี่พร้อม ?code=&state= หลัง login สำเร็จ
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const raw = req.cookies.get(COOKIE.pkce)?.value;

  const fail = () => NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!code || !state || !raw) return fail();

  let saved: { verifier: string; state: string; next: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail();
  }
  if (saved.state !== state) return fail();

  let tokens;
  try {
    tokens = await exchangeCode(code, saved.verifier, `${req.nextUrl.origin}/api/auth/callback`);
  } catch {
    return fail();
  }

  const res = NextResponse.redirect(new URL(saved.next, req.nextUrl.origin));
  applyTokenSet(res.cookies, tokens);
  res.cookies.set(COOKIE.pkce, "", cookieOpts(0));
  return res;
}

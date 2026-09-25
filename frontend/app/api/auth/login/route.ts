import { NextRequest, NextResponse } from "next/server";
import { authEndpoint, CLIENT_ID, COOKIE, cookieOpts, pkceChallenge, randomToken } from "@/lib/session";
import { safeNext } from "@/lib/format";

// เริ่ม PKCE flow: สร้าง code_verifier + state แล้วพาไปหน้า login ของ Keycloak
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next") ?? undefined);
  const verifier = randomToken();
  const state = randomToken(16);
  const challenge = await pkceChallenge(verifier);

  const url = new URL(authEndpoint());
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/auth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE.pkce, JSON.stringify({ verifier, state, next }), cookieOpts(300));
  return res;
}

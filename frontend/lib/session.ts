import "server-only";

// เก็บ token ของ Keycloak ไว้ใน HttpOnly cookie ฝั่ง Next.js (ทำหน้าที่เป็น BFF)
// browser ไม่เห็น token เลย เหมือน tb_session cookie แบบเดิม
// - tb_at / tb_rt / tb_exp: access token, refresh token, เวลาหมดอายุของ access token (unix seconds)
// - tb_pkce: code_verifier + state + next ระหว่างขั้นตอน login (อายุสั้น ใช้ครั้งเดียว)
export const COOKIE = { at: "tb_at", rt: "tb_rt", exp: "tb_exp", pkce: "tb_pkce" } as const;

const ISSUER = process.env.KEYCLOAK_ISSUER ?? "http://localhost:8081/realms/tablebook";
export const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "tablebook-web";
const SECURE = process.env.COOKIE_SECURE === "true";
const SESSION_MAXAGE = 60 * 60 * 24 * 7; // 7 วัน เหมือน tb_session เดิม (ตัดสิทธิ์จริงอยู่ที่ refresh token ของ Keycloak)
const REFRESH_SKEW = 20; // วินาที: refresh ล่วงหน้าก่อนหมดอายุจริง กัน race ระหว่าง request

export const authEndpoint = () => `${ISSUER}/protocol/openid-connect/auth`;
export const registerEndpoint = () => `${ISSUER}/protocol/openid-connect/registrations`;
export const tokenEndpoint = () => `${ISSUER}/protocol/openid-connect/token`;

export function cookieOpts(maxAgeSeconds: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: SECURE, path: "/", maxAge: maxAgeSeconds };
}

type TokenSet = { access_token: string; refresh_token: string; expires_in: number };

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Keycloak token endpoint ตอบ ${res.status}`);
  return res.json();
}

export function exchangeCode(code: string, verifier: string, redirectUri: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }));
}

function refreshAccessToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  }));
}

type CookieJar = { get(name: string): { value: string } | undefined };

// อ่าน access token ที่ใช้ได้จาก cookie ปัจจุบัน refresh ให้อัตโนมัติถ้าใกล้หมดอายุ
// หมายเหตุ: ถ้าเรียกจาก Server Component (ผ่าน serverGet) จะ refresh ให้ใช้งานได้ในคำขอนั้น
// แต่ "เขียน" cookie ใหม่กลับไปที่ browser ไม่ได้ (ข้อจำกัดของ React Server Component)
// รอบถัดไปที่ middleware.ts ทำงาน (คำขอไป /api/*) จะ persist cookie ที่ refresh แล้วให้เอง
export async function getValidAccessToken(cookies: CookieJar): Promise<{ token: string | null; refreshed?: TokenSet }> {
  const at = cookies.get(COOKIE.at)?.value;
  const exp = Number(cookies.get(COOKIE.exp)?.value ?? 0);
  if (at && Date.now() / 1000 < exp - REFRESH_SKEW) {
    return { token: at };
  }
  const rt = cookies.get(COOKIE.rt)?.value;
  if (!rt) return { token: null };
  try {
    const fresh = await refreshAccessToken(rt);
    return { token: fresh.access_token, refreshed: fresh };
  } catch {
    return { token: null };
  }
}

type CookieWriter = { set(name: string, value: string, opts: ReturnType<typeof cookieOpts>): void };

export function applyTokenSet(jar: CookieWriter, tokens: TokenSet) {
  jar.set(COOKIE.at, tokens.access_token, cookieOpts(SESSION_MAXAGE));
  jar.set(COOKIE.rt, tokens.refresh_token, cookieOpts(SESSION_MAXAGE));
  jar.set(COOKIE.exp, String(Math.floor(Date.now() / 1000) + tokens.expires_in), cookieOpts(SESSION_MAXAGE));
}

export function clearSessionCookies(jar: CookieWriter) {
  jar.set(COOKIE.at, "", cookieOpts(0));
  jar.set(COOKIE.rt, "", cookieOpts(0));
  jar.set(COOKIE.exp, "", cookieOpts(0));
}

// PKCE (RFC 7636): ใช้ Web Crypto API เพราะทำงานได้ทั้งใน Node.js runtime และ Edge runtime ของ middleware
function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLen = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLen)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

// ใช้ร่วมกันโดย /api/auth/login และ /api/auth/register: สร้าง code_verifier + state
// แล้วพาไปหน้า login หรือหน้าสมัครสมาชิกของ Keycloak (endpoint ต่างกัน แต่ callback เดียวกัน)
export async function startPkceRedirect(endpoint: string, origin: string, next: string, extraParams: Record<string, string> = {}) {
  const verifier = randomToken();
  const state = randomToken(16);
  const challenge = await pkceChallenge(verifier);

  const url = new URL(endpoint);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

  return { url, verifier, state };
}

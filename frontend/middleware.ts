import { NextRequest, NextResponse } from "next/server";
import { applyTokenSet, getValidAccessToken } from "@/lib/session";

// เส้นทางที่ Next.js จัดการเอง (คุยกับ Keycloak โดยตรง) ไม่ต้องแนบ Authorization header
const OWN_AUTH_ROUTES = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/callback", "/api/auth/logout"]);

export async function middleware(req: NextRequest) {
  if (OWN_AUTH_ROUTES.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // แปลง cookie session เป็น Authorization: Bearer header ก่อนคำขอนี้ถูก rewrite ไปที่ Go backend
  // (ดู next.config.ts: rewrites() proxy /api/:path* ไป BACKEND_URL)
  const { token, refreshed } = await getValidAccessToken(req.cookies);

  const headers = new Headers(req.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");

  const res = NextResponse.next({ request: { headers } });
  if (refreshed) applyTokenSet(res.cookies, refreshed);
  return res;
}

export const config = { matcher: ["/api/:path*"] };

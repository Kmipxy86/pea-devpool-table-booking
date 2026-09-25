import "server-only";
import { cookies } from "next/headers";
import type { User } from "./types";

// ใช้ใน Server Component เท่านั้น: เรียก Go backend ตรง ๆ จากฝั่ง server
// ต้องส่ง cookie ของผู้ใช้ต่อไปเอง เพราะ request นี้ไม่ได้มาจาก browser
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8080";

export async function serverGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const res = await fetch(BACKEND + path, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store", // ข้อมูลการจองเปลี่ยนตลอด ไม่ cache
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} ตอบ ${res.status}`);
  return (await res.json()) as T;
}

export function getMe() {
  return serverGet<User>("/api/auth/me");
}

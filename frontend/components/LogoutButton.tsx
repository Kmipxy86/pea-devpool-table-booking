"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export default function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh(); // ให้ Server Component (Header) ดึงข้อมูลผู้ใช้ใหม่
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>{label}</button>
  );
}

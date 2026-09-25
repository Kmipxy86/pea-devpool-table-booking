"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

export default function DeleteRestaurantButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(`ลบร้าน “${name}” ถาวร? การจองและรีวิวของร้านนี้จะถูกลบด้วย`)) return;
    setBusy(true);
    try {
      await api(`/api/restaurants/${id}`, { method: "DELETE" });
      router.push("/owner");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      setBusy(false);
    }
  }
  return <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>{busy ? "กำลังลบ..." : "ลบร้าน"}</button>;
}

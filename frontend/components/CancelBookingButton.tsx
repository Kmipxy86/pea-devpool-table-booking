"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

export default function CancelBookingButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!confirm("ยืนยันยกเลิกการจองนี้?")) return;
    setBusy(true);
    try {
      await api(`/api/bookings/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={cancel}>{busy ? "กำลังยกเลิก..." : "ยกเลิกการจอง"}</button>;
}

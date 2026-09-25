"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { t, type Locale } from "@/lib/i18n";

export default function CancelBookingButton({ id, locale }: { id: number; locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const s = t[locale];
  async function cancel() {
    if (!confirm(s.cancelConfirm)) return;
    setBusy(true);
    try {
      await api(`/api/bookings/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : s.cancelFailed);
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={cancel}>{busy ? s.cancelling : s.cancelBooking}</button>;
}

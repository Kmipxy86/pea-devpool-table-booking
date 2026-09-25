"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { t, type Locale } from "@/lib/i18n";

export default function DeleteRestaurantButton({ id, name, locale }: { id: number; name: string; locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const s = t[locale];
  async function remove() {
    if (!confirm(s.confirmDelete(name))) return;
    setBusy(true);
    try {
      await api(`/api/restaurants/${id}`, { method: "DELETE" });
      router.push("/owner");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : s.deleteFailed);
      setBusy(false);
    }
  }
  return <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>{busy ? s.deleting : s.deleteRestaurant}</button>;
}

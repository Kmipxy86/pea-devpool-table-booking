"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import type { Locale } from "@/lib/i18n";

export default function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const next: Locale = locale === "th" ? "en" : "th";

  async function switchLocale() {
    await api("/api/locale", { method: "POST", body: JSON.stringify({ locale: next }) });
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={switchLocale}>
      {locale === "th" ? "EN" : "ไทย"}
    </button>
  );
}

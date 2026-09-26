"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";

// Client Component เพราะต้องรู้ URL ปัจจุบัน (usePathname) เพื่อไฮไลต์เมนู
export default function NavLinks({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const s = t[locale];
  const links = [
    { href: "/", label: s.navAll, match: (p: string) => p === "/" || p.startsWith("/restaurants") },
    { href: "/bookings", label: s.navBookings, match: (p: string) => p.startsWith("/bookings") },
  ];
  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`nav-link${l.match(pathname) ? " active" : ""}`}>
          {l.label}
        </Link>
      ))}
    </>
  );
}

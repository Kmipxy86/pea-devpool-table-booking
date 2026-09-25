"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "ร้านทั้งหมด", match: (p: string) => p === "/" || p.startsWith("/restaurants") },
  { href: "/bookings", label: "การจองของฉัน", match: (p: string) => p.startsWith("/bookings") },
  { href: "/owner", label: "ร้านของฉัน", match: (p: string) => p.startsWith("/owner") },
];

// Client Component เพราะต้องรู้ URL ปัจจุบัน (usePathname) เพื่อไฮไลต์เมนู
export default function NavLinks() {
  const pathname = usePathname();
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

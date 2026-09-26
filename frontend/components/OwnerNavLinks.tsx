"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";

// เหมือน NavLinks.tsx แต่เป็นเมนูของ Owner console (แยกจากเมนูฝั่งลูกค้า)
export default function OwnerNavLinks({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const s = t[locale];
  const links = [
    { href: "/owner", label: s.navOwner, match: (p: string) => p === "/owner" || /^\/owner\/[^/]+(\/edit)?$/.test(p) },
    { href: "/owner/new", label: s.createNew, match: (p: string) => p === "/owner/new" },
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

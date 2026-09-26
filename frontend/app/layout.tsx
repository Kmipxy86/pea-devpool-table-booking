import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "โต๊ะว่าง — จองโต๊ะร้านอาหาร",
  description: "ระบบจองโต๊ะร้านอาหารและ community รีวิวร้าน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        {/* โหลดฟอนต์ตอนเปิดหน้า (ถ้าออฟไลน์ จะใช้ฟอนต์สำรองใน globals.css แทน) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Prompt:wght@500;600&display=swap"
        />
      </head>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}

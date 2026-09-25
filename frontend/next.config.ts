import type { NextConfig } from "next";

// หน้าเว็บเรียก /api/... และ /uploads/... ที่ origin เดียวกับ Next.js
// แล้ว Next.js ส่งต่อ (proxy) ไปให้ Go backend
// ข้อดี: cookie ของ session เป็น same-origin ไม่ต้องตั้ง CORS
const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;

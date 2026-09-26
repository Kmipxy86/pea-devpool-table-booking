import Header from "@/components/Header";

// Layout เฉพาะฝั่งลูกค้า (browse/จอง/รีวิว) แยกจาก Owner console ใน app/owner/layout.tsx
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}

import Link from "next/link";
import { serverGet } from "@/lib/server-api";
import type { Restaurant } from "@/lib/types";
import RestaurantCard from "@/components/RestaurantCard";

type Props = { searchParams: Promise<{ sort?: string; q?: string }> };

// Server Component: ดึงรายการร้านจาก Go ตั้งแต่ฝั่ง server แล้วส่ง HTML ที่มีข้อมูลแล้วไปให้ browser
export default async function HomePage({ searchParams }: Props) {
  const { sort = "rated", q = "" } = await searchParams;
  const qs = new URLSearchParams({ sort, q });
  const list = (await serverGet<Restaurant[]>(`/api/restaurants?${qs}`)) ?? [];

  const tab = (value: string, label: string) => (
    <Link
      href={`/?${new URLSearchParams({ sort: value, q })}`}
      className={`pill${sort === value ? " active" : ""}`}
      aria-current={sort === value ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <main className="container">
      <section className="hero">
        <span className="eyebrow">จองโต๊ะร้านอาหาร</span>
        <h1>วันนี้อยากนั่งร้านไหน</h1>
        <p className="muted">เลือกร้าน วัน เวลา และจำนวนคน ระบบจะบอกทันทีว่ายังมีที่ว่างไหม</p>
        {/* ฟอร์มแบบ GET ธรรมดา: ส่งคำค้นผ่าน URL ไม่ต้องใช้ JavaScript */}
        <form className="search-bar" action="/" role="search">
          <input type="hidden" name="sort" value={sort} />
          <input className="input" style={{ flex: 1 }} name="q" defaultValue={q} placeholder="ค้นหาชื่อร้าน ประเภทอาหาร หรือย่าน" aria-label="ค้นหาร้าน" />
          <button className="btn btn-primary" type="submit">ค้นหา</button>
        </form>
      </section>

      <section className="page" style={{ paddingTop: 24 }}>
        <div className="between">
          <div className="stack" style={{ gap: 2 }}>
            <h2>{q ? `ผลการค้นหา “${q}”` : "ร้านทั้งหมด"} <span className="small muted" style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>{list.length} ร้าน</span></h2>
            <span className="xs muted">
              {sort === "reviews" ? "เรียงตามจำนวนรีวิวมากที่สุด" : "เรียงตามคะแนนเฉลี่ยที่ถ่วงด้วยจำนวนรีวิว ร้านที่รีวิวน้อยจะไม่แซงขึ้นมาง่าย ๆ"}
            </span>
          </div>
          <div className="row">
            {tab("rated", "Highest rated!")}
            {tab("reviews", "Most reviewed!")}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="card empty">ไม่พบร้านที่ตรงกับคำค้น</div>
        ) : (
          <div className="restaurant-grid">
            {list.map((r) => <RestaurantCard key={r.id} r={r} />)}
          </div>
        )}
      </section>
    </main>
  );
}

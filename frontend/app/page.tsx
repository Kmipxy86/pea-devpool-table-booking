import Link from "next/link";
import { serverGet } from "@/lib/server-api";
import type { Restaurant } from "@/lib/types";
import RestaurantCard from "@/components/RestaurantCard";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";

type Props = { searchParams: Promise<{ sort?: string; q?: string }> };

// Server Component: ดึงรายการร้านจาก Go ตั้งแต่ฝั่ง server แล้วส่ง HTML ที่มีข้อมูลแล้วไปให้ browser
export default async function HomePage({ searchParams }: Props) {
  const { sort = "rated", q = "" } = await searchParams;
  const qs = new URLSearchParams({ sort, q });
  const [list, locale] = await Promise.all([
    serverGet<Restaurant[]>(`/api/restaurants?${qs}`).then((r) => r ?? []),
    getLocale(),
  ]);
  const s = t[locale];

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
        <span className="eyebrow">{s.homeEyebrow}</span>
        <h1>{s.homeTitle}</h1>
        <p className="muted">{s.homeSubtitle}</p>
        {/* ฟอร์มแบบ GET ธรรมดา: ส่งคำค้นผ่าน URL ไม่ต้องใช้ JavaScript */}
        <form className="search-bar" action="/" role="search">
          <input type="hidden" name="sort" value={sort} />
          <input className="input" style={{ flex: 1 }} name="q" defaultValue={q} placeholder={s.searchPlaceholder} aria-label={s.searchAria} />
          <button className="btn btn-primary" type="submit">{s.searchBtn}</button>
        </form>
      </section>

      <section className="page" style={{ paddingTop: 24 }}>
        <div className="between">
          <div className="stack" style={{ gap: 2 }}>
            <h2>{q ? s.searchResultsFor(q) : s.allRestaurants} <span className="small muted" style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>{s.restaurantsCount(list.length)}</span></h2>
            <span className="xs muted">
              {sort === "reviews" ? s.sortByReviews : s.sortByRating}
            </span>
          </div>
          <div className="row">
            {tab("rated", "Highest rated!")}
            {tab("reviews", "Most reviewed!")}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="card empty">{s.noResults}</div>
        ) : (
          <div className="restaurant-grid">
            {list.map((r) => <RestaurantCard key={r.id} r={r} locale={locale} />)}
          </div>
        )}
      </section>
    </main>
  );
}

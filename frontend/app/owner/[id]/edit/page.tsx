import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe, serverGet } from "@/lib/server-api";
import type { RestaurantDetail } from "@/lib/types";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import RestaurantForm from "@/components/RestaurantForm";
import DeleteRestaurantButton from "@/components/DeleteRestaurantButton";

type Props = { params: Promise<{ id: string }> };

export default async function EditRestaurantPage({ params }: Props) {
  const { id } = await params;
  if (!(await getMe())) redirect(`/login?next=/owner/${id}/edit`);
  const locale = await getLocale();
  const s = t[locale];
  const r = await serverGet<RestaurantDetail>(`/api/restaurants/${id}`);
  // ซ่อนหน้าให้คนที่ไม่ใช่เจ้าของ (แต่ตัวกันจริงอยู่ที่ API ซึ่งจะตอบ 403)
  if (!r || !r.is_mine) notFound();
  return (
    <main className="container page" style={{ maxWidth: 860 }}>
      <nav className="small"><Link href={`/owner/${r.id}`}>← {r.name}</Link></nav>
      <div className="between"><h1>{s.editRestaurant}</h1><DeleteRestaurantButton id={r.id} name={r.name} locale={locale} /></div>
      <RestaurantForm initial={r} locale={locale} />
    </main>
  );
}

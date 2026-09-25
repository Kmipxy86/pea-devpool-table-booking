import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/server-api";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import RestaurantForm from "@/components/RestaurantForm";

export default async function NewRestaurantPage() {
  if (!(await getMe())) redirect("/login?next=/owner/new");
  const locale = await getLocale();
  const s = t[locale];
  return (
    <main className="container page" style={{ maxWidth: 860 }}>
      <nav className="small"><Link href="/owner">← {s.navOwner}</Link></nav>
      <h1>{s.createRestaurantTitle}</h1>
      <RestaurantForm locale={locale} />
    </main>
  );
}

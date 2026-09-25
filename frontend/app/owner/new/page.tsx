import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/server-api";
import RestaurantForm from "@/components/RestaurantForm";

export default async function NewRestaurantPage() {
  if (!(await getMe())) redirect("/login?next=/owner/new");
  return (
    <main className="container page" style={{ maxWidth: 860 }}>
      <nav className="small"><Link href="/owner">← ร้านของฉัน</Link></nav>
      <h1>สร้างร้านใหม่</h1>
      <RestaurantForm />
    </main>
  );
}

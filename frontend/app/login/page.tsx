import AuthForm from "@/components/AuthForm";
import { safeNext } from "@/lib/format";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={safeNext(next)} />;
}

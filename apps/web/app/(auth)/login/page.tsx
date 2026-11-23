import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";
import { getMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  // Already signed in (and the session is really valid): go straight in.
  const me = await getMe();
  if (me.ok) redirect(me.data.mustChangePassword ? "/change-password" : "/dashboard");

  const { expired } = await searchParams;
  return (
    <AuthFrame area="Dashboard" title="Sign in" subtitle="Use the email and password your admin gave you.">
      <LoginForm scope="app" notice={expired ? "Your session ended. Please sign in again." : undefined} />
    </AuthFrame>
  );
}

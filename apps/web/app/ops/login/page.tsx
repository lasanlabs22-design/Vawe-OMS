import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";
import { getOpsMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Ops console" };

export default async function OpsLoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const me = await getOpsMe();
  if (me.ok) redirect(me.data.mustChangePassword ? "/ops/password" : "/ops");

  const { expired } = await searchParams;
  return (
    <AuthFrame area="Ops console" title="Ops console" subtitle="Admins only. Manage who can use the dashboard and what they can do.">
      <LoginForm scope="ops" notice={expired ? "Your console session ended. Please sign in again." : undefined} />
    </AuthFrame>
  );
}

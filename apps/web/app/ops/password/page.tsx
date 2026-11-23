import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ChangePasswordForm } from "@/components/auth-forms";
import { getOpsMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Set your password" };

export default async function OpsPasswordPage() {
  const me = await getOpsMe();
  if (!me.ok) redirect("/ops/login");
  if (!me.data.mustChangePassword) redirect("/ops/profile");

  return (
    <AuthFrame area="Ops console" title={`Welcome, ${me.data.name.split(" ")[0]}`} subtitle="Choose your own password to replace the temporary one.">
      <ChangePasswordForm scope="ops" forced />
    </AuthFrame>
  );
}

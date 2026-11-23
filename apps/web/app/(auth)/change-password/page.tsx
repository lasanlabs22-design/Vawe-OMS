import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ChangePasswordForm } from "@/components/auth-forms";
import { getMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Set your password" };

// First sign-in with a temporary password: nothing else is reachable until it's replaced.
export default async function ChangePasswordPage() {
  const me = await getMe();
  if (!me.ok) redirect("/login");
  if (!me.data.mustChangePassword) redirect("/settings");

  return (
    <AuthFrame area="OMS Dashboard" title={`Welcome, ${me.data.name.split(" ")[0]}`} subtitle="Choose your own password to replace the temporary one.">
      <ChangePasswordForm scope="app" forced />
    </AuthFrame>
  );
}

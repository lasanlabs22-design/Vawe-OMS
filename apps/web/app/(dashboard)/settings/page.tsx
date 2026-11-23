import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth-forms";
import { ProfileForm } from "@/components/profile-form";
import { Card, PageHeader } from "@/components/ui";
import { requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireMe();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Your profile and password." />
      <ProfileForm me={me} scope="app" />
      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 mb-5 text-sm text-ink-2">Changing it signs you out on your other devices.</p>
        <div className="max-w-sm">
          <ChangePasswordForm scope="app" />
        </div>
      </Card>
    </div>
  );
}

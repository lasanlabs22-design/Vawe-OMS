import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth-forms";
import { ProfileForm } from "@/components/profile-form";
import { Card, PageHeader } from "@/components/ui";
import { requireOpsMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "My profile · Ops" };

export default async function OpsProfilePage() {
  const me = await requireOpsMe();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" description="The same profile you see in the dashboard." />
      <ProfileForm me={me} scope="ops" />
      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 mb-5 text-sm text-ink-2">Changing it signs you out on your other devices.</p>
        <div className="max-w-sm">
          <ChangePasswordForm scope="ops" />
        </div>
      </Card>
    </div>
  );
}

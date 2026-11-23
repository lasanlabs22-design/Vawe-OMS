import type { Metadata } from "next";
import { canEdit, type Rates } from "@vawe/shared";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui";
import { VendorForm } from "@/components/vendors/vendor-form";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Add vendor" };

export default async function NewVendorPage() {
  const me = await requireMe();
  if (!canEdit(me, "vendor")) return <NoAccess module="vendor" />;
  const defaults = await apiGet<Rates>("/v1/settings/rates");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add vendor" description="The vendor ID is created automatically when you save." />
      <VendorForm isAdmin={me.settings === "edit"} defaultRates={defaults.ok ? defaults.data : {}} />
    </div>
  );
}

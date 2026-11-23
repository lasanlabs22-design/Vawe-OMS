import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canEdit, type Rates, type VendorDetail } from "@vawe/shared";
import { LoadError, NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui";
import { VendorForm } from "@/components/vendors/vendor-form";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!canEdit(me, "vendor")) return <NoAccess module="vendor" />;
  const { id } = await params;
  const [res, defaults] = await Promise.all([apiGet<VendorDetail>(`/v1/vendors/${id}`), apiGet<Rates>("/v1/settings/rates")]);
  if (!res.ok) return res.status === 404 ? notFound() : <LoadError message={res.error.error} />;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit ${res.data.firmName}`} description={res.data.code} />
      <VendorForm vendor={res.data} isAdmin={me.settings === "edit"} defaultRates={defaults.ok ? defaults.data : {}} />
    </div>
  );
}

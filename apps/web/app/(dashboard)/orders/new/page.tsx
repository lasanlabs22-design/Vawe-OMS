import type { Metadata } from "next";
import { canEdit, type Catalog } from "@vawe/shared";
import { LoadError, NoAccess } from "@/components/no-access";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "New order" };

type VendorOption = { id: string; code: string; firmName: string; isWalkIn: boolean; pricingModel: string };

export default async function NewOrderPage() {
  const me = await requireMe();
  if (!canEdit(me, "order")) return <NoAccess module="order" />;
  const [catalog, vendors] = await Promise.all([apiGet<Catalog>("/v1/catalog"), apiGet<VendorOption[]>("/v1/vendor-options")]);
  if (!catalog.ok) return <LoadError message={catalog.error.error} />;
  return (
    <>
      <PageHeader title="New order" description="The order code is created when you save. The DWG drawing and job card are made from the items." />
      <OrderForm catalog={catalog.data} vendors={vendors.ok ? vendors.data : []} />
    </>
  );
}

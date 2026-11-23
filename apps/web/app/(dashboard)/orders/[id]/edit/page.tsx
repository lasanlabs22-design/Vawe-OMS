import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canEdit, type Catalog, type OrderDetail } from "@vawe/shared";
import { LoadError, NoAccess } from "@/components/no-access";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Edit order" };

type VendorOption = { id: string; code: string; firmName: string; isWalkIn: boolean; pricingModel: string };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!canEdit(me, "order")) return <NoAccess module="order" />;
  const { id } = await params;
  const [order, catalog, vendors] = await Promise.all([apiGet<OrderDetail>(`/v1/orders/${id}`), apiGet<Catalog>("/v1/catalog"), apiGet<VendorOption[]>("/v1/vendor-options")]);
  if (!order.ok) return order.status === 404 ? notFound() : <LoadError message={order.error.error} />;
  if (!catalog.ok) return <LoadError message={catalog.error.error} />;
  return (
    <>
      <PageHeader title={`Edit ${order.data.code}`} description="Changing items or the vendor recalculates the estimate." />
      <OrderForm catalog={catalog.data} vendors={vendors.ok ? vendors.data : []} order={order.data} />
    </>
  );
}

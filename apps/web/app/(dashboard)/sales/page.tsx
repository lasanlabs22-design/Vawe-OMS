import type { Metadata } from "next";
import { canView, type SalesOverview, type SalesProducts, type SalesRange, type SalesSources } from "@vawe/shared";
import { LoadError, NoAccess } from "@/components/no-access";
import { SalesDayByDay, SalesOverviewView, SalesProductsView, SalesSourcesView } from "@/components/sales/sales-views";
import { PageHeader } from "@/components/ui";
import { PendingFrame, Tabs, UrlStateProvider } from "@/components/url-state";
import { addMonths, addDays, isDay, todayIST } from "@/lib/dates";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sales" };

const TABS = [
  { value: "overview", label: "This month" },
  { value: "days", label: "Day by day" },
  { value: "products", label: "Products" },
  { value: "sources", label: "Sources" },
];

type Search = { tab?: string; month?: string; from?: string; to?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireMe();
  if (!canView(me, "sales")) return <NoAccess module="sales" />;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "overview";
  const today = todayIST();

  let body: React.ReactNode;
  if (tab === "overview") {
    const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const data = await apiGet<SalesOverview>(`/v1/sales/overview?month=${month}`);
    body = data.ok ? <SalesOverviewView data={data.data} /> : <LoadError message={data.error.error} />;
  } else if (tab === "days") {
    // Default: the client's example, one month to the same day of the next (e.g. Oct 23 → Nov 23).
    const to = isDay(sp.to) ? sp.to : today;
    const from = isDay(sp.from) ? sp.from : addMonths(to, -1);
    const data = await apiGet<SalesRange>(`/v1/sales/range?from=${from}&to=${to}`);
    body = data.ok ? <SalesDayByDay data={data.data} /> : <LoadError message={data.error.error} />;
  } else {
    const to = isDay(sp.to) ? sp.to : today;
    const from = isDay(sp.from) ? sp.from : addDays(today, -89);
    if (tab === "products") {
      const data = await apiGet<SalesProducts>(`/v1/sales/products?from=${from}&to=${to}`);
      body = data.ok ? <SalesProductsView data={data.data} from={from} to={to} /> : <LoadError message={data.error.error} />;
    } else {
      const data = await apiGet<SalesSources>(`/v1/sales/sources?from=${from}&to=${to}`);
      body = data.ok ? <SalesSourcesView data={data.data} from={from} to={to} /> : <LoadError message={data.error.error} />;
    }
  }

  return (
    <UrlStateProvider>
      <PageHeader title="Sales" description="Order counts and value (before GST, cancelled orders excluded), by order date." />
      <Tabs tabs={TABS} value={tab} />
      <PendingFrame>{body}</PendingFrame>
    </UrlStateProvider>
  );
}

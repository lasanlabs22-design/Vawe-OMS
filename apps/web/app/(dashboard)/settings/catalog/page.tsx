import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Catalog, Company, Rates } from "@vawe/shared";
import { LoadError } from "@/components/no-access";
import { CatalogEditor, CompanyForm, DefaultRatesForm } from "@/components/settings/catalog-admin";
import { PageHeader } from "@/components/ui";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Catalogue & prices" };

export default async function CatalogSettingsPage() {
  const me = await requireMe();
  if (me.role !== "admin") redirect("/settings");
  const [catalog, rates, company] = await Promise.all([apiGet<Catalog>("/v1/catalog"), apiGet<Rates>("/v1/settings/rates"), apiGet<Company>("/v1/settings/company")]);
  if (!catalog.ok) return <LoadError message={catalog.error.error} />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Catalogue & prices" description="Admins only. What the order form offers and how estimates are priced." />
      <DefaultRatesForm rates={rates.ok ? rates.data : {}} />
      <CatalogEditor catalog={catalog.data} />
      {company.ok && <CompanyForm company={company.data} />}
    </div>
  );
}

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
  if (me.settings === "none") redirect("/settings");
  const readOnly = me.settings !== "edit";
  const [catalog, rates, company] = await Promise.all([apiGet<Catalog>("/v1/catalog"), apiGet<Rates>("/v1/settings/rates"), apiGet<Company>("/v1/settings/company")]);
  if (!catalog.ok) return <LoadError message={catalog.error.error} />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Catalogue & prices"
        description={readOnly ? "View only. Changing these needs edit access to Catalogue & prices." : "What the order form offers and how estimates are priced."}
      />
      {/* A disabled fieldset turns every input and button inside it off for view-only admins. */}
      <fieldset disabled={readOnly} className="space-y-5">
        <DefaultRatesForm rates={rates.ok ? rates.data : {}} />
        <CatalogEditor catalog={catalog.data} />
        {company.ok && <CompanyForm company={company.data} />}
      </fieldset>
    </div>
  );
}

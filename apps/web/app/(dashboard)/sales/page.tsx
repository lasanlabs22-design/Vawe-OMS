import type { Metadata } from "next";
import { ModulePage } from "@/components/module-page";
import { requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sales" };

export default async function Page() {
  const me = await requireMe();
  return <ModulePage me={me} module="sales" />;
}
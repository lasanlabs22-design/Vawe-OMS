import { Shell } from "@/components/shell";
import { requireMe } from "@/lib/server-api";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  return <Shell me={me}>{children}</Shell>;
}

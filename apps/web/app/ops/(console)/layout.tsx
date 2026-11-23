import { OpsNav } from "@/components/ops/ops-nav";
import { requireOpsMe } from "@/lib/server-api";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const me = await requireOpsMe();
  return (
    <div className="min-h-dvh">
      <OpsNav me={me} />
      <main className="animate-rise mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

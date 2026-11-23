import type { Metadata } from "next";
import type { TeamMember } from "@vawe/shared";
import { AddPersonButton, TeamList } from "@/components/ops/team";
import { Alert, Card, PageHeader } from "@/components/ui";
import { apiGet, requireOpsMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "People · Ops" };

export default async function PeoplePage() {
  const me = await requireOpsMe();
  const team = await apiGet<TeamMember[]>("/ops/users");

  const active = team.ok ? team.data.filter((m) => m.isActive) : [];
  const stats = [
    { label: "Active people", value: active.length },
    { label: "Admins", value: active.filter((m) => m.role === "admin").length },
    { label: "Yet to sign in", value: active.filter((m) => m.mustChangePassword).length },
  ];

  return (
    <>
      <PageHeader title="People" description="Who can use the Vawe dashboard, and what each person can see and change.">
        <AddPersonButton />
      </PageHeader>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <Card key={s.label} className="animate-rise p-4" >
            <p style={{ animationDelay: `${i * 60}ms` }} className="text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">{s.label}</p>
          </Card>
        ))}
      </div>
      {team.ok ? <TeamList team={team.data} me={me} /> : <Alert>{team.error.error}</Alert>}
    </>
  );
}

import { AlertTriangle, CheckCircle2, CircleDashed, Eye } from "lucide-react";
import type { VendorHealth } from "@vawe/shared";
import { Badge } from "../ui";

export const HEALTH: Record<VendorHealth, { label: string; tone: "good" | "warn" | "bad" | "neutral"; icon: typeof CheckCircle2; help: string }> = {
  good: { label: "Good", tone: "good", icon: CheckCircle2, help: "Pays on time" },
  watch: { label: "Watch", tone: "warn", icon: Eye, help: "Something overdue, or often late" },
  at_risk: { label: "At risk", tone: "bad", icon: AlertTriangle, help: "More than 30 days overdue" },
  new: { label: "New", tone: "neutral", icon: CircleDashed, help: "Nothing has fallen due yet" },
};

/** Health is never colour alone: icon + word + colour. */
export function HealthBadge({ health }: { health: VendorHealth }) {
  const h = HEALTH[health];
  const Icon = h.icon;
  return (
    <span title={h.help}>
      <Badge tone={h.tone}>
        <Icon size={12} className="mr-1" aria-hidden /> {h.label}
      </Badge>
    </span>
  );
}

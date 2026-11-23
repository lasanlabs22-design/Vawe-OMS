import Link from "next/link";
import { PauseCircle } from "lucide-react";
import { stagePhase, STAGE_LABELS, type OrderListItem, type OrderStage } from "@vawe/shared";
import { dayLabel } from "@/lib/dates";
import { money } from "@/lib/format";
import { cx } from "@/lib/cx";
import { Badge, Card } from "../ui";

const PHASE_TONE = { pre: "neutral", production: "brand", done: "good", cancelled: "bad" } as const;

export function StageBadge({ stage, onHold }: { stage: OrderStage; onHold?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={PHASE_TONE[stagePhase(stage)]}>{STAGE_LABELS[stage]}</Badge>
      {onHold && (
        <Badge tone="warn">
          <PauseCircle size={12} className="mr-1" aria-hidden /> On hold
        </Badge>
      )}
    </span>
  );
}

export function OrderTable({ orders, showVendor = true, empty = "No orders yet." }: { orders: OrderListItem[]; showVendor?: boolean; empty?: string }) {
  if (!orders.length) return <Card className="p-8 text-center text-sm text-ink-3">{empty}</Card>;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2.5 font-medium sm:px-5">Order</th>
              {showVendor && <th className="px-3 py-2.5 font-medium">Vendor</th>}
              <th className="px-3 py-2.5 font-medium">Project</th>
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium sm:px-5">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((o) => (
              <tr key={o.id} className="group transition-colors hover:bg-surface-2/60">
                <td className="px-4 py-3 sm:px-5">
                  <Link href={`/orders/${o.id}`} className="font-medium tabular-nums group-hover:text-brand">
                    {o.code}
                  </Link>
                  <p className="text-[12px] text-ink-3">
                    {dayLabel(o.orderDate)} · {o.shutters} shutter{o.shutters === 1 ? "" : "s"}
                  </p>
                </td>
                {showVendor && <td className="px-3 py-3">{o.vendorName}</td>}
                <td className="px-3 py-3">
                  <p>{o.projectName ?? o.customerName ?? "—"}</p>
                  <p className="text-[12px] text-ink-3">{[o.customerName && o.projectName ? o.customerName : null, o.location].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-3">
                  <StageBadge stage={o.stage} onHold={o.onHold} />
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{money(o.total)}</td>
                <td className={cx("px-4 py-3 text-right tabular-nums sm:px-5", o.paid >= o.total - 0.5 ? "text-good" : "text-ink-2")}>
                  {o.paid >= o.total - 0.5 && o.total > 0 ? "Paid" : money(o.paid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

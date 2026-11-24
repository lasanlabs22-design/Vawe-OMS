"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Ban, Check, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { PRODUCTION_STAGES, STAGE_FLOW, STAGE_LABELS, stagePhase, type OrderDetail, type OrderStage } from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { Alert, Button, cx, Dialog, Field, Input, Select } from "../ui";

/** The stage track: every stage in order, done ones ticked, the current one highlighted. */
export function StageTrack({ order }: { order: OrderDetail }) {
  const current = STAGE_FLOW.indexOf(order.stage);
  const groups: { label: string; stages: OrderStage[] }[] = [
    { label: "Before production", stages: ["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"] },
    { label: "Production", stages: PRODUCTION_STAGES },
    { label: "Delivery", stages: ["dispatched", "delivered"] },
  ];
  let n = 0;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)_minmax(0,2fr)]">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-[11.5px] font-medium tracking-wide text-ink-3 uppercase">{g.label}</p>
          <ol className="flex gap-1">
            {g.stages.map((s) => {
              const i = STAGE_FLOW.indexOf(s);
              const done = order.stage !== "cancelled" && i < current;
              const now = s === order.stage;
              const delay = n++ * 45;
              return (
                <li key={s} className="min-w-0 flex-1" title={STAGE_LABELS[s]}>
                  <div
                    style={{ animationDelay: `${delay}ms` }}
                    className={cx(
                      "animate-rise h-2 rounded-full",
                      done ? "bg-chart-1" : now ? (order.onHold ? "bg-warn" : "bg-chart-1 ring-4 ring-brand/20") : "bg-surface-2",
                    )}
                  />
                  <p className={cx("mt-1.5 hidden truncate text-[11px] lg:block", now ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3")}>
                    {done && <Check size={10} className="mr-0.5 inline" />}
                    {STAGE_LABELS[s].replace("Waiting for ", "")}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function OrderActions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "stage" | "hold" | "release" | "cancel">(null);
  const [stage, setStage] = useState<OrderStage>(order.stage);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const i = STAGE_FLOW.indexOf(order.stage);
  const next = i >= 0 && i < STAGE_FLOW.length - 1 ? STAGE_FLOW[i + 1]! : null;
  const prev = i > 0 ? STAGE_FLOW[i - 1]! : null;
  const closed = order.stage === "cancelled";
  const blockedByHold = order.onHold && next && stagePhase(order.stage) === "production" && stagePhase(next) === "production";

  async function run(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/v1/orders/${order.id}/${path}`, body);
      setDialog(null);
      setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  if (closed) return null;
  return (
    <>
      {error && !dialog && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {next && (
          <Button onClick={() => run("stage", { stage: next })} loading={busy && !dialog} disabled={!!blockedByHold} title={blockedByHold ? "Release the hold first" : undefined}>
            Move to {STAGE_LABELS[next].replace("Waiting ", "waiting ")} <ArrowRight size={16} />
          </Button>
        )}
        {prev && (
          <Button variant="secondary" onClick={() => run("stage", { stage: prev })} disabled={busy} aria-label={`Back to ${STAGE_LABELS[prev]}`}>
            <ArrowLeft size={16} /> Back
          </Button>
        )}
        <Button variant="secondary" onClick={() => (setStage(order.stage), setDialog("stage"))}>
          Set stage…
        </Button>
        {order.stage !== "delivered" && order.stage !== "dispatched" &&
          (order.onHold ? (
            <Button variant="secondary" onClick={() => setDialog("release")}>
              <PlayCircle size={16} /> Release hold
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setDialog("hold")}>
              <PauseCircle size={16} /> Hold for procurement
            </Button>
          ))}
        {stagePhase(order.stage) === "pre" && (
          <Button variant="ghost" onClick={() => run("reprice", {})} disabled={busy} title="Recalculate with the vendor's current prices">
            <RefreshCw size={15} /> Reprice
          </Button>
        )}
        {order.stage !== "delivered" && (
          <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setDialog("cancel")}>
            <Ban size={15} /> Cancel order
          </Button>
        )}
      </div>

      <Dialog open={dialog === "stage"} onClose={() => setDialog(null)} title="Set stage" description="Jump to any stage, forwards or back. It's recorded in the history.">
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 space-y-4">
          <Field label="Stage" htmlFor="set-stage">
            <Select id="set-stage" value={stage} onChange={(e) => setStage(e.target.value as OrderStage)}>
              {STAGE_FLOW.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="stage-note" optional>
            <Input id="stage-note" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {stage === "delivered" && <p className="text-[13px] text-ink-2">Delivering sets the payment due date from the vendor's terms.</p>}
          <div className="flex justify-end">
            <Button loading={busy} disabled={stage === order.stage} onClick={() => run("stage", { stage, note: text })}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "hold"} onClose={() => setDialog(null)} title="Hold for procurement" description="Materials aren't here yet. The order keeps its stage and can't move forward in production until released.">
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 space-y-4">
          <Field label="What's missing?" htmlFor="hold-reason">
            <Input id="hold-reason" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Digital print glass" autoFocus />
          </Field>
          <div className="flex justify-end">
            <Button loading={busy} disabled={!text.trim()} onClick={() => run("hold", { reason: text })}>
              Put on hold
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "release"} onClose={() => setDialog(null)} title="Release the hold" description={order.holdReason ? `Held for: ${order.holdReason}` : undefined}>
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 space-y-4">
          <Field label="Note" htmlFor="release-note" optional>
            <Input id="release-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Glass arrived" />
          </Field>
          <div className="flex justify-end">
            <Button loading={busy} onClick={() => run("release", { note: text })}>
              Release
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "cancel"} onClose={() => setDialog(null)} title={`Cancel ${order.code}?`} description="It stays on record but leaves sales and money owed. This can't be undone.">
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 space-y-4">
          <Field label="Why?" htmlFor="cancel-reason">
            <Input id="cancel-reason" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Keep order
            </Button>
            <Button variant="danger" loading={busy} disabled={!text.trim()} onClick={() => run("cancel", { reason: text })}>
              Cancel order
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

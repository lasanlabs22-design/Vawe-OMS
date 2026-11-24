import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canView, type Company, type OrderDetail } from "@vawe/shared";
import { LogoMark, Wordmark } from "@/components/brand";
import { NoAccess, LoadError } from "@/components/no-access";
import { PrintBar } from "@/components/orders/print-bar";
import { ShutterSketch } from "@/components/orders/shutter-sketch";
import { dayLong } from "@/lib/dates";
import { number, phone } from "@/lib/format";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "DWG & job card" };

// The workbook's "Dwg Output" sheet: order header, the stage sign-off table, material usage, and one
// drawing per item. Printed on A4 (or saved as PDF from the print dialog).
const SIGN_OFF = ["Drawing", "Checked", "Cutting", "Drilling", "Glass cutting", "Hinge hole", "Assembly", "Packing", "Dispatch"];

export default async function DwgPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!canView(me, "order")) return <NoAccess module="order" />;
  const { id } = await params;
  const [res, company] = await Promise.all([apiGet<OrderDetail>(`/v1/orders/${id}`), apiGet<Company>("/v1/settings/company")]);
  if (!res.ok) return res.status === 404 ? notFound() : <LoadError message={res.error.error} />;
  const o = res.data;
  const orderTypes = [...new Set(o.items.map((i) => i.orderType))].join(", ");

  return (
    <>
      <style>{`@page { size: A4; margin: 10mm; } @media print { .sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; } }`}</style>
      <PrintBar backHref={`/orders/${o.id}`} title={`${o.code} · DWG & job card`} />
      <div className="sheet mx-auto my-6 max-w-[900px] bg-white p-8 text-[13px] text-black shadow-xl print:my-0 print:max-w-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <Wordmark height={16} tone="dark" />
              <p className="mt-1 text-[11px]">{company.ok ? company.data.name : "Vawe Interio"}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] tracking-wider uppercase">DWG & job card</p>
            <p className="text-2xl font-bold tabular-nums">{o.code}</p>
          </div>
        </header>

        <table className="mt-4 w-full border-collapse text-[12.5px]">
          <tbody>
            <tr>
              <Th>Firm name</Th>
              <Td>{o.vendorName}</Td>
              <Th>Order date</Th>
              <Td>{dayLong(o.orderDate)}</Td>
            </tr>
            <tr>
              <Th>Customer</Th>
              <Td>{[o.customerName, o.customerPhone && phone(o.customerPhone)].filter(Boolean).join(" · ") || "—"}</Td>
              <Th>Expected delivery</Th>
              <Td>{o.expectedDelivery ? dayLong(o.expectedDelivery) : "—"}</Td>
            </tr>
            <tr>
              <Th>Project</Th>
              <Td>{[o.projectName, o.location].filter(Boolean).join(" · ") || "—"}</Td>
              <Th>No. of shutters</Th>
              <Td>{o.shutters}</Td>
            </tr>
            <tr>
              <Th>Project manager</Th>
              <Td>{[o.pmName, o.pmPhone && phone(o.pmPhone)].filter(Boolean).join(" · ") || "—"}</Td>
              <Th>Order type</Th>
              <Td>{orderTypes}</Td>
            </tr>
          </tbody>
        </table>

        <div className="mt-5 grid grid-cols-[1fr_1.2fr] gap-5">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <Th>Stage</Th>
                <Th>Date</Th>
                <Th>Signature</Th>
              </tr>
            </thead>
            <tbody>
              {SIGN_OFF.map((s) => (
                <tr key={s}>
                  <Td className="font-medium">{s}</Td>
                  <Td className="w-24">&nbsp;</Td>
                  <Td className="w-28">&nbsp;</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full self-start border-collapse text-[12.5px]">
            <thead>
              <tr>
                <Th colSpan={2}>Material usage</Th>
              </tr>
            </thead>
            <tbody>
              {o.materials.profiles.map((p) => (
                <tr key={p.name}>
                  <Td>Profile {p.name}</Td>
                  <Td className="text-right tabular-nums">{number(p.rft, 1)} r ft</Td>
                </tr>
              ))}
              {o.materials.glass.map((g) => (
                <tr key={g.name}>
                  <Td>Glass: {g.name}</Td>
                  <Td className="text-right tabular-nums">{number(g.sqft, 1)} sq ft</Td>
                </tr>
              ))}
              {o.materials.handles.map((h) => (
                <tr key={h.name}>
                  <Td>Handle: {h.name}</Td>
                  <Td className="text-right tabular-nums">{h.count}</Td>
                </tr>
              ))}
              {o.materials.hinges > 0 && (
                <tr>
                  <Td>Hinges</Td>
                  <Td className="text-right tabular-nums">{o.materials.hinges}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {o.items.map((it) => (
            <figure key={it.id} className="break-inside-avoid border border-black p-3">
              <p className="mb-1 flex justify-between text-[11px] font-semibold">
                <span>Item {it.position}</span>
                <span>{it.orderType}</span>
              </p>
              <div className="flex justify-center text-black">
                <ShutterSketch item={it} size={140} className="text-black" />
              </div>
              <figcaption className="mt-2 space-y-0.5 text-[11.5px] leading-snug">
                <p>
                  <b>Profile:</b> {it.frameType} {it.frameColour} Profile
                </p>
                <p>
                  <b>Glass:</b> {it.glassType}
                </p>
                <p>
                  <b>Handle type:</b> {it.handleType} {it.handleColour} ({it.handlePosition})
                </p>
                <p>
                  <b>Divider:</b> {it.divider}
                  {it.family === "profile_shutter" && (
                    <>
                      {" "}
                      · <b>Hinges:</b> {it.hingeHoles}
                    </>
                  )}
                </p>
                <p>
                  <b>Qty:</b> {it.quantity} · {it.widthMm} × {it.heightMm} mm
                </p>
              </figcaption>
            </figure>
          ))}
        </div>

        {o.notes && (
          <p className="mt-5 border-t border-black pt-3 text-[12px]">
            <b>Notes:</b> {o.notes}
          </p>
        )}
      </div>
    </>
  );
}

function Th({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <th colSpan={colSpan} className="border border-black bg-neutral-100 px-2 py-1.5 text-left font-semibold">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-black px-2 py-1.5 ${className}`}>{children}</td>;
}

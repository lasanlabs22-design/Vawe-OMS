import type { OrderFamily } from "@vawe/shared";

// The DWG drawing of one item, rebuilt from the workbook's drawing macros (modShapes):
//   profile shutter  the shutter outline, the handle bar on the handle side, hinge holes spaced evenly
//                    on the opposite side (first and last set in from the ends), divider lines
//   sliding          one panel per shutter, side by side, with the divider lines
// The outline keeps the real width-to-height ratio (within limits), unlike the workbook's fixed boxes.

export interface SketchItem {
  family: OrderFamily;
  widthMm: number;
  heightMm: number;
  handlePosition: string;
  handleType: string;
  divider: string;
  hingeHoles: number;
  quantity: number;
}

const INK = "currentColor";

function dividerLines(divider: string, x: number, y: number, w: number, h: number) {
  const d = divider.toLowerCase();
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const hLine = (yy: number) => lines.push({ x1: x, y1: yy, x2: x + w, y2: yy });
  const inset = Math.min(h * 0.16, 46);
  if (d.includes("top")) hLine(y + inset);
  if (d.includes("bottom")) hLine(y + h - inset);
  const mid = y + h / 2;
  const band = Math.min(h * 0.09, 22);
  if (d.includes("single center")) hLine(mid);
  if (d.includes("double center")) {
    hLine(mid - band / 2);
    hLine(mid + band / 2);
  }
  const check = d.match(/(single|double|triple) check - (\d) row/);
  if (check) {
    const rowsH = check[1] === "single" ? 2 : check[1] === "double" ? 3 : 4;
    const top = mid - band;
    const bottom = mid + band;
    for (let i = 0; i < rowsH; i++) hLine(top + ((bottom - top) * i) / (rowsH - 1));
    const cols = Number(check[2]);
    for (let i = 1; i < cols; i++) lines.push({ x1: x + (w * i) / cols, y1: top, x2: x + (w * i) / cols, y2: bottom });
  }
  return lines;
}

/** One item's drawing. `size` is the longest side of the outline in px. */
export function ShutterSketch({ item, size = 170, showLabels = true, className = "text-ink" }: { item: SketchItem; size?: number; showLabels?: boolean; className?: string }) {
  const w0 = Math.max(1, item.widthMm || 1);
  const h0 = Math.max(1, item.heightMm || 1);

  if (item.family === "sliding") {
    const panels = Math.max(1, Math.min(item.quantity || 1, 6));
    // Each panel keeps the item's proportions; the row of panels fits the box.
    const ratio = Math.min(Math.max(w0 / h0, 0.25), 1.4);
    const ph = size;
    const pw = Math.min(ph * ratio, (size * 1.6) / panels);
    const totalW = pw * panels;
    const pad = 28;
    const W = totalW + pad * 2;
    const H = ph + pad * 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={`max-w-full ${className}`} role="img" aria-label={`Sliding, ${panels} panels, ${item.widthMm} by ${item.heightMm} mm`}>
        {Array.from({ length: panels }, (_, i) => {
          const x = pad + i * pw;
          return (
            <g key={i}>
              <rect x={x} y={pad} width={pw} height={ph} fill="none" stroke={INK} strokeWidth={2.5} rx={1} />
              {dividerLines(item.divider, x, pad, pw, ph).map((l, j) => (
                <line key={j} {...l} stroke={INK} strokeWidth={1.6} />
              ))}
              {!/no handle/i.test(item.handleType) && <rect x={x + pw - 7} y={pad + ph * 0.42} width={3} height={ph * 0.16} fill={INK} rx={1} />}
            </g>
          );
        })}
        {showLabels && (
          <>
            <text x={W / 2} y={pad - 9} textAnchor="middle" className="fill-current text-[11px] font-semibold">
              W-{item.widthMm}
            </text>
            <text x={pad - 9} y={H / 2} textAnchor="middle" transform={`rotate(-90 ${pad - 9} ${H / 2})`} className="fill-current text-[11px] font-semibold">
              H-{item.heightMm}
            </text>
          </>
        )}
      </svg>
    );
  }

  // Profile shutter
  const ratio = Math.min(Math.max(w0 / h0, 0.22), 2.2);
  const w = ratio >= 1 ? size : size * ratio;
  const h = ratio >= 1 ? size / ratio : size;
  const pad = 30;
  const W = w + pad * 2;
  const H = h + pad * 2 + (showLabels ? 14 : 0);
  const x = pad;
  const y = pad;
  const pos = item.handlePosition.toLowerCase();
  const noHandle = /no handle/i.test(item.handleType);
  const bar = 6;
  const gap = 2; // keeps the bar clear of the outline's stroke

  // Handle bar on the handle side, just outside the outline.
  let handle: { x: number; y: number; w: number; h: number } | null = null;
  if (!noHandle) {
    if (pos === "right") handle = { x: x + w + gap, y, w: bar, h };
    else if (pos === "left") handle = { x: x - bar - gap, y, w: bar, h };
    else if (pos === "top") handle = { x, y: y - bar - gap, w, h: bar };
    else if (pos.includes("bottom")) handle = { x, y: y + h + gap, w, h: bar };
  }

  // Hinge holes on the opposite side, evenly spaced, the ends set in from the corners.
  const holes: { cx: number; cy: number }[] = [];
  const n = Math.max(2, Math.min(item.hingeHoles || 2, 5));
  const along = (len: number, i: number) => {
    const inset = Math.min(len * 0.12, 26);
    return inset + ((len - inset * 2) * i) / (n - 1);
  };
  const r = 4.5;
  for (let i = 0; i < n; i++) {
    if (pos === "right" || pos === "only bottom right") holes.push({ cx: x + 9, cy: y + along(h, i) });
    else if (pos === "left" || pos === "only bottom left") holes.push({ cx: x + w - 9, cy: y + along(h, i) });
    else if (pos === "top") holes.push({ cx: x + along(w, i), cy: y + h - 9 });
    else if (pos === "bottom") holes.push({ cx: x + along(w, i), cy: y + 9 });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={`max-w-full ${className}`} role="img" aria-label={`Shutter ${item.widthMm} by ${item.heightMm} mm, handle ${item.handlePosition}, ${n} hinge holes, ${item.divider}`}>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={INK} strokeWidth={2.5} rx={1} />
      {dividerLines(item.divider, x, y, w, h).map((l, j) => (
        <line key={j} {...l} stroke={INK} strokeWidth={1.6} />
      ))}
      {handle && <rect {...handle} fill="var(--brand)" rx={1.5} />}
      {holes.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={r} fill="var(--surface)" stroke={INK} strokeWidth={1.8} />
      ))}
      {showLabels && (
        <>
          <text x={x + w / 2} y={y - 12} textAnchor="middle" className="fill-current text-[11px] font-semibold">
            W-{item.widthMm}
          </text>
          <text x={x - 12} y={y + h / 2} textAnchor="middle" transform={`rotate(-90 ${x - 12} ${y + h / 2})`} className="fill-current text-[11px] font-semibold">
            H-{item.heightMm}
          </text>
          <text x={x + w / 2} y={y + h + 26} textAnchor="middle" className="fill-current text-[11px] font-semibold">
            Qty {item.quantity}
          </text>
        </>
      )}
    </svg>
  );
}

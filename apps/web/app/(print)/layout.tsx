// Pages meant for paper (the DWG / job card): no dashboard frame.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-surface-2 print:bg-white">{children}</div>;
}

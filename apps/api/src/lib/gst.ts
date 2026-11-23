import { checkGstin, type GstLookup } from "@vawe/shared";

// GSTIN lookup. The offline check (format, check digit, state) always runs and is free. When a GST API
// is configured it then fetches the registered name, address and status.
//
//   GST_PROVIDER=cashfree
//   CASHFREE_CLIENT_ID=...  CASHFREE_CLIENT_SECRET=...  CASHFREE_ENV=sandbox|production
//
// Field names follow Cashfree's Verification API docs; confirm them with the sandbox keys when they
// arrive (the mapping below is tolerant of missing fields).

export async function lookupGstin(input: string): Promise<GstLookup> {
  const check = checkGstin(input);
  if (!check.valid) return { valid: false, reason: check.reason, source: "offline" };
  const base: GstLookup = { valid: true, gstin: check.gstin, state: check.state, pan: check.pan, source: "offline", details: null };

  if (process.env.GST_PROVIDER !== "cashfree" || !process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_CLIENT_SECRET) {
    return { ...base, message: "The GSTIN looks right. Automatic company details turn on once the GST API keys are added." };
  }

  const host = process.env.CASHFREE_ENV === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";
  try {
    const res = await fetch(`${host}/verification/gstin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": process.env.CASHFREE_CLIENT_ID,
        "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
      },
      body: JSON.stringify({ GSTIN: check.gstin }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ...base, message: `The GST service said: ${String(data.message ?? res.statusText)}` };
    const str = (k: string) => (typeof data[k] === "string" && data[k] ? (data[k] as string) : undefined);
    const address = data.principal_place_address;
    return {
      ...base,
      source: "api",
      details: {
        legalName: str("legal_name_of_business"),
        tradeName: str("trade_name_of_business"),
        address: typeof address === "string" ? address : undefined,
        status: str("gst_in_status"),
      },
    };
  } catch {
    return { ...base, message: "The GST service didn't answer. The GSTIN itself looks right; try again later for the details." };
  }
}

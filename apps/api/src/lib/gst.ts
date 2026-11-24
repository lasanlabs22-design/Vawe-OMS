import { constants, publicEncrypt } from "node:crypto";
import { checkGstin, type GstLookup } from "@vawe/shared";

// GSTIN lookup. The offline check (format, check digit, state) always runs and is free. When a GST API
// is configured it then fetches the registered name, address and status.
//
//   GST_PROVIDER=cashfree
//   CASHFREE_CLIENT_ID=...  CASHFREE_CLIENT_SECRET=...  CASHFREE_ENV=sandbox|production
//   CASHFREE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."   (when Cashfree's 2FA method is Public Key)
//
// Field names follow Cashfree's Verification API (confirmed against the sandbox). The mapping is
// tolerant of missing fields. Cashfree checks every call by IP whitelist or, with the Public Key
// method, by a signature: Railway has no fixed outgoing IP, so production uses the signature.

/** Cashfree's 2FA signature: "clientId.unixSeconds" encrypted with RSA-OAEP (SHA-1), base64. Valid 5 minutes. */
function signature(clientId: string): string | undefined {
  // Accepts the PEM as written, or on one line with \n escapes (some hosts store it that way).
  const pem = process.env.CASHFREE_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (!pem) return undefined;
  const payload = Buffer.from(`${clientId}.${Math.floor(Date.now() / 1000)}`);
  return publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" }, payload).toString("base64");
}

export async function lookupGstin(input: string): Promise<GstLookup> {
  const check = checkGstin(input);
  if (!check.valid) return { valid: false, reason: check.reason, source: "offline" };
  const base: GstLookup = { valid: true, gstin: check.gstin, state: check.state, pan: check.pan, source: "offline", details: null };

  if (process.env.GST_PROVIDER !== "cashfree" || !process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_CLIENT_SECRET) {
    return { ...base, message: "The GSTIN looks right. Automatic company details turn on once the GST API keys are added." };
  }

  const host = process.env.CASHFREE_ENV === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";
  let signed: string | undefined;
  try {
    signed = signature(process.env.CASHFREE_CLIENT_ID);
  } catch (err) {
    console.error("CASHFREE_PUBLIC_KEY can't be used:", (err as Error).message);
    return { ...base, message: "The GST lookup is misconfigured (the Cashfree public key can't be read). The GSTIN itself looks right." };
  }
  try {
    const res = await fetch(`${host}/verification/gstin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": process.env.CASHFREE_CLIENT_ID,
        "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
        ...(signed ? { "x-cf-signature": signed } : {}),
      },
      body: JSON.stringify({ GSTIN: check.gstin }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ...base, message: `The GST service said: ${String(data.message ?? res.statusText)}` };
    // A well-formed GSTIN that isn't registered comes back as 200 "GSTIN Doesn't Exist", without `valid`.
    if (data.valid !== true) return { valid: false, reason: "No GST registration found for this GSTIN. Check it with the vendor.", source: "api" };
    const text = (o: Record<string, unknown> | undefined, k: string) => (typeof o?.[k] === "string" && o[k] ? (o[k] as string).trim() : undefined);
    const split = (data.principal_place_split_address ?? undefined) as Record<string, unknown> | undefined;
    const others = Array.isArray(data.additional_address_array) ? data.additional_address_array.length : 0;
    const registeredOn = text(data, "date_of_registration");
    return {
      ...base,
      source: "api",
      details: {
        legalName: text(data, "legal_name_of_business"),
        tradeName: text(data, "trade_name_of_business"),
        address: text(data, "principal_place_address"),
        city: text(split, "city") ?? text(split, "district"),
        pincode: text(split, "pincode"),
        state: text(split, "state"),
        status: text(data, "gst_in_status"),
        businessType: text(data, "constitution_of_business"),
        taxpayerType: text(data, "taxpayer_type"),
        registeredOn: registeredOn && /^\d{4}-\d{2}-\d{2}$/.test(registeredOn) ? registeredOn : undefined,
        branches: 1 + others,
      },
    };
  } catch {
    return { ...base, message: "The GST service didn't answer. The GSTIN itself looks right; try again later for the details." };
  }
}

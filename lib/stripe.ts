import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe over plain HTTPS. No SDK, no build step, works in any Node runtime.
 * Every call takes the shop's own secret key, so one Sere deployment can serve
 * many shops that each keep their own Stripe account and their own money.
 */

const API = "https://api.stripe.com/v1";
const API_VERSION = "2024-06-20";

export class StripeError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = "StripeError";
  }
}

type Params = Record<string, unknown>;

/** Stripe takes nested form data: metadata[invoice_id], line_items[0][quantity]. */
export function encodeParams(params: Params, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          parts.push(encodeParams(item as Params, `${name}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(encodeParams(value as Params, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function request<T>(
  secretKey: string,
  path: string,
  options: { method?: "GET" | "POST"; params?: Params; idempotencyKey?: string } = {},
): Promise<T> {
  if (!secretKey) throw new StripeError("No Stripe secret key is configured.");
  const method = options.method || "GET";
  const body = options.params ? encodeParams(options.params) : "";
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": API_VERSION,
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: method === "POST" ? body : undefined });
  } catch (error) {
    throw new StripeError(`Could not reach Stripe: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new StripeError(
      payload.error?.message || `Stripe returned ${response.status}.`,
      response.status,
      payload.error?.code,
    );
  }
  return payload as T;
}

export type StripeAccount = {
  id: string;
  email?: string | null;
  business_profile?: { name?: string | null } | null;
  settings?: { dashboard?: { display_name?: string | null } | null } | null;
  charges_enabled?: boolean;
};

export function accountLabel(account: StripeAccount): string {
  return (
    account.settings?.dashboard?.display_name ||
    account.business_profile?.name ||
    account.email ||
    account.id
  );
}

/** Confirms a secret key works and reports which account it belongs to. */
export function retrieveAccount(secretKey: string): Promise<StripeAccount> {
  return request<StripeAccount>(secretKey, "/account");
}

export type CheckoutSession = {
  id: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
};

export function createCheckoutSession(
  secretKey: string,
  opts: {
    amountCents: number;
    currency?: string;
    productName: string;
    description?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string | number>;
    idempotencyKey?: string;
  },
): Promise<CheckoutSession> {
  return request<CheckoutSession>(secretKey, "/checkout/sessions", {
    method: "POST",
    idempotencyKey: opts.idempotencyKey,
    params: {
      mode: "payment",
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      customer_email: opts.customerEmail,
      metadata: opts.metadata,
      payment_intent_data: { metadata: opts.metadata, description: opts.description },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: opts.currency || "usd",
            unit_amount: opts.amountCents,
            product_data: { name: opts.productName, description: opts.description },
          },
        },
      ],
    },
  });
}

export function retrieveCheckoutSession(secretKey: string, id: string): Promise<CheckoutSession> {
  return request<CheckoutSession>(secretKey, `/checkout/sessions/${encodeURIComponent(id)}`);
}

/**
 * Verifies the Stripe-Signature header the way Stripe documents it:
 * HMAC-SHA256 over "<timestamp>.<raw body>" compared against every v1 signature.
 */
export function verifyWebhookSignature(opts: {
  payload: string;
  header: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): boolean {
  if (!opts.header || !opts.secret) return false;
  const parts = new Map<string, string[]>();
  for (const piece of opts.header.split(",")) {
    const [key, value] = piece.split("=");
    if (!key || !value) continue;
    const list = parts.get(key.trim()) || [];
    list.push(value.trim());
    parts.set(key.trim(), list);
  }
  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1") || [];
  if (!timestamp || !signatures.length) return false;

  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > tolerance) return false;

  const expected = createHmac("sha256", opts.secret)
    .update(`${timestamp}.${opts.payload}`, "utf8")
    .digest("hex");
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}

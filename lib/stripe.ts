import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe over plain HTTPS. No SDK, no build step, works in any Node runtime.
 * Every call takes the shop's own secret key, so one Sere deployment can serve
 * many shops that each keep their own Stripe account and their own money.
 */

/** STRIPE_API_BASE exists so tests can point at a local stand in. */
const API = process.env.STRIPE_API_BASE || "https://api.stripe.com/v1";
const API_VERSION = "2024-06-20";

export class StripeError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = "StripeError";
  }
}

export function looksLikeStripeSecret(key: string): boolean {
  return /^(sk|rk)_(test|live)_/.test(key.trim());
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

export async function stripeRequest<T>(
  secretKey: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    params?: Params;
    idempotencyKey?: string;
    stripeAccount?: string;
  } = {},
): Promise<T> {
  if (!secretKey) throw new StripeError("No Stripe API key is configured.");
  const method = options.method || "GET";
  const body = options.params ? encodeParams(options.params) : "";
  const url = (method === "GET" || method === "DELETE") && body ? `${API}${path}?${body}` : `${API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": API_VERSION,
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.stripeAccount) headers["Stripe-Account"] = options.stripeAccount;

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
  return stripeRequest<StripeAccount>(secretKey, "/account");
}

type StripeFund = { amount?: number; currency?: string };

export function usdCents(funds?: StripeFund[] | null): number {
  if (!funds?.length) return 0;
  const usd = funds.find((row) => (row.currency || "usd").toLowerCase() === "usd") || funds[0];
  return Number(usd.amount || 0);
}

export type StripeBalance = {
  available?: StripeFund[];
  pending?: StripeFund[];
};

export function retrieveBalance(
  secretKey: string,
  opts: { stripeAccount?: string } = {},
): Promise<StripeBalance> {
  return stripeRequest<StripeBalance>(secretKey, "/balance", { stripeAccount: opts.stripeAccount });
}

export type StripeCharge = {
  id?: string;
  amount?: number;
  amount_refunded?: number;
  status?: string;
  created?: number;
  description?: string | null;
};

export async function listCharges(
  secretKey: string,
  opts: {
    createdGte?: number;
    createdLt?: number;
    limit?: number;
    stripeAccount?: string;
  } = {},
): Promise<StripeCharge[]> {
  const rows: StripeCharge[] = [];
  let startingAfter: string | undefined;
  const pageSize = 100;
  const max = opts.limit && opts.limit > 0 ? opts.limit : 1000;
  const created =
    opts.createdGte || opts.createdLt
      ? { gte: opts.createdGte, lt: opts.createdLt }
      : undefined;
  while (rows.length < max) {
    const payload = await stripeRequest<{ data?: StripeCharge[]; has_more?: boolean }>(
      secretKey,
      "/charges",
      {
        stripeAccount: opts.stripeAccount,
        params: {
          limit: Math.min(pageSize, max - rows.length),
          starting_after: startingAfter,
          created,
        },
      },
    );
    const page = payload.data || [];
    rows.push(...page);
    if (!payload.has_more || !page.length) break;
    startingAfter = page[page.length - 1]?.id;
    if (!startingAfter) break;
  }
  return rows;
}

export function chargeNetCents(charge: StripeCharge): number {
  if (charge.status && charge.status !== "succeeded") return 0;
  return Math.max(0, Number(charge.amount || 0) - Number(charge.amount_refunded || 0));
}

export type StripePayout = {
  id?: string;
  amount?: number;
  status?: string;
  arrival_date?: number;
};

export async function listPayouts(
  secretKey: string,
  opts: { limit?: number; stripeAccount?: string } = {},
): Promise<StripePayout[]> {
  const payload = await stripeRequest<{ data?: StripePayout[] }>(secretKey, "/payouts", {
    stripeAccount: opts.stripeAccount,
    params: { limit: opts.limit || 5 },
  });
  return payload.data || [];
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
    stripeAccount?: string;
  },
): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>(secretKey, "/checkout/sessions", {
    method: "POST",
    idempotencyKey: opts.idempotencyKey,
    stripeAccount: opts.stripeAccount,
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

export function retrieveCheckoutSession(
  secretKey: string,
  id: string,
  opts: { stripeAccount?: string } = {},
): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>(secretKey, `/checkout/sessions/${encodeURIComponent(id)}`, {
    stripeAccount: opts.stripeAccount,
  });
}

export type StripeAddress = {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export type StripeCustomer = {
  id: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  deleted?: boolean;
  address?: StripeAddress | null;
  metadata?: Record<string, string> | null;
};

export type StripeCustomerWrite = {
  name?: string;
  email?: string;
  phone?: string;
  address?: StripeAddress;
  metadata?: Record<string, string | number>;
  stripeAccount?: string;
  idempotencyKey?: string;
};

export function createStripeCustomer(
  secretKey: string,
  opts: StripeCustomerWrite,
): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>(secretKey, "/customers", {
    method: "POST",
    stripeAccount: opts.stripeAccount,
    idempotencyKey: opts.idempotencyKey,
    params: {
      name: opts.name,
      email: opts.email,
      phone: opts.phone,
      address: opts.address,
      metadata: opts.metadata,
    },
  });
}

export function retrieveStripeCustomer(
  secretKey: string,
  id: string,
  opts: { stripeAccount?: string } = {},
): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>(secretKey, `/customers/${encodeURIComponent(id)}`, {
    stripeAccount: opts.stripeAccount,
  });
}

export function updateStripeCustomer(
  secretKey: string,
  id: string,
  opts: StripeCustomerWrite,
): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>(secretKey, `/customers/${encodeURIComponent(id)}`, {
    method: "POST",
    stripeAccount: opts.stripeAccount,
    params: {
      name: opts.name,
      email: opts.email,
      phone: opts.phone,
      address: opts.address,
      metadata: opts.metadata,
    },
  });
}

export async function listStripeCustomers(
  secretKey: string,
  opts: {
    limit?: number;
    startingAfter?: string;
    stripeAccount?: string;
  } = {},
): Promise<{ data: StripeCustomer[]; hasMore: boolean }> {
  const payload = await stripeRequest<{ data?: StripeCustomer[]; has_more?: boolean }>(
    secretKey,
    "/customers",
    {
      stripeAccount: opts.stripeAccount,
      params: {
        limit: opts.limit || 100,
        starting_after: opts.startingAfter,
      },
    },
  );
  return { data: payload.data || [], hasMore: Boolean(payload.has_more) };
}

export type StripeInvoiceLine = {
  id?: string;
  description?: string | null;
  quantity?: number | null;
  amount?: number;
  unit_amount?: number | null;
  price?: { unit_amount?: number | null } | null;
};

export type StripeInvoice = {
  id: string;
  status?: string | null;
  customer?: string | StripeCustomer | null;
  number?: string | null;
  description?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  total?: number | null;
  subtotal?: number | null;
  due_date?: number | null;
  created?: number | null;
  metadata?: Record<string, string> | null;
  lines?: { data?: StripeInvoiceLine[] } | null;
};

export function createStripeInvoice(
  secretKey: string,
  opts: {
    customer: string;
    description?: string;
    collectionMethod?: "send_invoice" | "charge_automatically";
    daysUntilDue?: number;
    dueDate?: number;
    metadata?: Record<string, string | number>;
    stripeAccount?: string;
    idempotencyKey?: string;
  },
): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(secretKey, "/invoices", {
    method: "POST",
    stripeAccount: opts.stripeAccount,
    idempotencyKey: opts.idempotencyKey,
    params: {
      customer: opts.customer,
      auto_advance: false,
      collection_method: opts.collectionMethod || "send_invoice",
      days_until_due: opts.daysUntilDue,
      due_date: opts.dueDate,
      description: opts.description,
      metadata: opts.metadata,
    },
  });
}

export function retrieveStripeInvoice(
  secretKey: string,
  id: string,
  opts: { stripeAccount?: string } = {},
): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(secretKey, `/invoices/${encodeURIComponent(id)}`, {
    stripeAccount: opts.stripeAccount,
    params: { expand: ["lines.data"] },
  });
}

export function addStripeInvoiceItem(
  secretKey: string,
  opts: {
    customer: string;
    invoice: string;
    description: string;
    amountCents: number;
    quantity?: number;
    currency?: string;
    stripeAccount?: string;
  },
): Promise<{ id: string }> {
  return stripeRequest<{ id: string }>(secretKey, "/invoiceitems", {
    method: "POST",
    stripeAccount: opts.stripeAccount,
    params: {
      customer: opts.customer,
      invoice: opts.invoice,
      description: opts.description,
      amount: opts.amountCents,
      quantity: opts.quantity || 1,
      currency: opts.currency || "usd",
    },
  });
}

export function voidStripeInvoice(
  secretKey: string,
  id: string,
  opts: { stripeAccount?: string } = {},
): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(secretKey, `/invoices/${encodeURIComponent(id)}/void`, {
    method: "POST",
    stripeAccount: opts.stripeAccount,
  });
}

export function finalizeStripeInvoice(
  secretKey: string,
  id: string,
  opts: { stripeAccount?: string } = {},
): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(secretKey, `/invoices/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    stripeAccount: opts.stripeAccount,
  });
}

export function payStripeInvoiceOutOfBand(
  secretKey: string,
  id: string,
  opts: { stripeAccount?: string } = {},
): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(secretKey, `/invoices/${encodeURIComponent(id)}/pay`, {
    method: "POST",
    stripeAccount: opts.stripeAccount,
    params: { paid_out_of_band: true },
  });
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

/** Platform Connect OAuth. STRIPE_CONNECT_BASE exists so tests can point at a stand in. */
const CONNECT = process.env.STRIPE_CONNECT_BASE || "https://connect.stripe.com";

export function stripeConnectClientId(): string {
  return process.env.STRIPE_CONNECT_CLIENT_ID || "";
}

export function stripePlatformSecret(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}

/** One-click Connect needs Sere's own Stripe platform credentials. */
export function stripeConnectEnabled(): boolean {
  return Boolean(stripeConnectClientId() && stripePlatformSecret());
}

type ConnectState = { organizationId: number; userId: number; exp: number };

function connectStateSecret(): string {
  return process.env.SERE_SECRET_KEY || process.env.AUTH_SECRET || "sere-dev-only-change-me";
}

export function signConnectState(organizationId: number, userId: number, now = Date.now()): string {
  const payload: ConnectState = {
    organizationId,
    userId,
    exp: now + 15 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", connectStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readConnectState(state: string | null, now = Date.now()): ConnectState | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", connectStateSecret()).update(body).digest("base64url");
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConnectState;
    if (!payload.organizationId || !payload.userId || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function stripeConnectAuthorizeUrl(opts: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: stripeConnectClientId(),
    scope: "read_write",
    state: opts.state,
    redirect_uri: opts.redirectUri,
  });
  return `${CONNECT}/oauth/authorize?${params.toString()}`;
}

export type StripeConnectToken = {
  access_token: string;
  stripe_user_id: string;
  stripe_publishable_key?: string;
  refresh_token?: string;
};

async function connectForm<T>(path: string, params: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CONNECT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeParams(params),
    });
  } catch (error) {
    throw new StripeError(`Could not reach Stripe: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || payload.error) {
    throw new StripeError(payload.error_description || payload.error || `Stripe returned ${response.status}.`);
  }
  return payload as T;
}

export function exchangeStripeConnectCode(code: string): Promise<StripeConnectToken> {
  const secret = stripePlatformSecret();
  if (!secret) throw new StripeError("Sere has not configured its Stripe platform key.");
  return connectForm<StripeConnectToken>("/oauth/token", {
    grant_type: "authorization_code",
    client_secret: secret,
    code,
  });
}

export async function deauthorizeStripeConnect(accountId: string): Promise<void> {
  const clientId = stripeConnectClientId();
  const secret = stripePlatformSecret();
  if (!clientId || !secret || !accountId) return;
  try {
    await connectForm("/oauth/deauthorize", {
      client_id: clientId,
      client_secret: secret,
      stripe_user_id: accountId,
    });
  } catch {
    // Already disconnected in Stripe, or Connect is not configured. Sere still drops the row.
  }
}

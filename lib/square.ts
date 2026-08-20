import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Square over HTTPS. Access tokens belong to the shop. Sandbox hosts exist
 * so a test token never hits production.
 */

const LIVE = process.env.SQUARE_API_BASE || "https://connect.squareup.com";
const SANDBOX = process.env.SQUARE_SANDBOX_API_BASE || "https://connect.squareupsandbox.com";

export class SquareError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SquareError";
  }
}

function baseUrl(sandbox?: boolean): string {
  return sandbox ? SANDBOX : LIVE;
}

function queryString(query?: Record<string, string | number | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function request<T>(
  accessToken: string,
  path: string,
  opts: {
    method?: "GET" | "POST";
    body?: unknown;
    sandbox?: boolean;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  if (!accessToken) throw new SquareError("No Square access token is configured.");
  const method = opts.method || "GET";
  let response: Response;
  try {
    response = await fetch(`${baseUrl(opts.sandbox)}${path}${queryString(opts.query)}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-05-15",
      },
      body: method === "POST" ? JSON.stringify(opts.body || {}) : undefined,
    });
  } catch (error) {
    throw new SquareError(`Could not reach Square: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    errors?: { detail?: string }[];
  };
  if (!response.ok) {
    throw new SquareError(payload.errors?.[0]?.detail || `Square returned ${response.status}.`, response.status);
  }
  return payload as T;
}

export type SquareLocation = { id: string; name?: string; status?: string };

export async function listSquareLocations(
  accessToken: string,
  sandbox?: boolean,
): Promise<SquareLocation[]> {
  const payload = await request<{ locations?: SquareLocation[] }>(accessToken, "/v2/locations", { sandbox });
  return (payload.locations || []).filter((row) => row.status !== "INACTIVE");
}

export async function squareAccountLabel(accessToken: string, sandbox?: boolean): Promise<string> {
  const locations = await listSquareLocations(accessToken, sandbox);
  return locations[0]?.name || locations[0]?.id || "Square account";
}

export type SquarePaymentLink = { id?: string; url?: string; order_id?: string };

export async function createSquarePaymentLink(
  accessToken: string,
  opts: {
    amountCents: number;
    locationId: string;
    name: string;
    redirectUrl: string;
    note?: string;
    sandbox?: boolean;
    idempotencyKey?: string;
  },
): Promise<SquarePaymentLink> {
  const payload = await request<{ payment_link?: SquarePaymentLink }>(accessToken, "/v2/online-checkout/payment-links", {
    method: "POST",
    sandbox: opts.sandbox,
    body: {
      idempotency_key: opts.idempotencyKey || crypto.randomUUID(),
      quick_pay: {
        name: opts.name,
        price_money: { amount: opts.amountCents, currency: "USD" },
        location_id: opts.locationId,
      },
      checkout_options: { redirect_url: opts.redirectUrl },
      payment_note: opts.note,
    },
  });
  return payload.payment_link || {};
}

export type SquareOrder = {
  id?: string;
  state?: string;
  total_money?: { amount?: number };
};

export type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  amount_money?: { amount?: number };
};

export type SquareMoney = { amount?: number; currency?: string };

export type SquareListedPayment = {
  id?: string;
  status?: string;
  amount_money?: SquareMoney;
  refunded_money?: SquareMoney;
  created_at?: string;
};

export function squarePaymentNetCents(payment: SquareListedPayment): number {
  if (payment.status && payment.status !== "COMPLETED") return 0;
  const amount = Number(payment.amount_money?.amount || 0);
  const refunded = Number(payment.refunded_money?.amount || 0);
  return Math.max(0, amount - refunded);
}

export async function listSquarePayments(
  accessToken: string,
  opts: {
    beginTime?: string;
    endTime?: string;
    locationId?: string;
    sandbox?: boolean;
    limit?: number;
  } = {},
): Promise<SquareListedPayment[]> {
  const rows: SquareListedPayment[] = [];
  let cursor: string | undefined;
  const max = opts.limit && opts.limit > 0 ? opts.limit : 1000;
  while (rows.length < max) {
    const payload = await request<{ payments?: SquareListedPayment[]; cursor?: string }>(
      accessToken,
      "/v2/payments",
      {
        sandbox: opts.sandbox,
        query: {
          begin_time: opts.beginTime,
          end_time: opts.endTime,
          location_id: opts.locationId,
          limit: Math.min(100, max - rows.length),
          cursor,
        },
      },
    );
    const page = payload.payments || [];
    rows.push(...page);
    if (!payload.cursor || !page.length) break;
    cursor = payload.cursor;
  }
  return rows;
}

export type SquareListedPayout = {
  id?: string;
  status?: string;
  amount_money?: SquareMoney;
  arrival_date?: string;
  created_at?: string;
};

export async function listSquarePayouts(
  accessToken: string,
  opts: { locationId?: string; sandbox?: boolean; limit?: number } = {},
): Promise<SquareListedPayout[]> {
  const payload = await request<{ payouts?: SquareListedPayout[] }>(accessToken, "/v2/payouts", {
    sandbox: opts.sandbox,
    query: {
      location_id: opts.locationId,
      limit: opts.limit || 5,
    },
  });
  return payload.payouts || [];
}

export async function retrieveSquarePayment(
  accessToken: string,
  paymentId: string,
  sandbox?: boolean,
): Promise<SquarePayment> {
  const payload = await request<{ payment?: SquarePayment }>(
    accessToken,
    `/v2/payments/${encodeURIComponent(paymentId)}`,
    { sandbox },
  );
  return payload.payment || {};
}

export async function retrieveSquareOrder(
  accessToken: string,
  orderId: string,
  sandbox?: boolean,
): Promise<SquareOrder> {
  const payload = await request<{ order?: SquareOrder }>(
    accessToken,
    `/v2/orders/${encodeURIComponent(orderId)}`,
    { sandbox },
  );
  return payload.order || {};
}

/**
 * Square signs webhooks as HMAC-SHA256 of notificationUrl + raw body, Base64.
 */
export function verifySquareSignature(opts: {
  payload: string;
  signature: string | null;
  signatureKey: string;
  notificationUrl: string;
}): boolean {
  if (!opts.signature || !opts.signatureKey || !opts.notificationUrl) return false;
  const expected = createHmac("sha256", opts.signatureKey)
    .update(opts.notificationUrl + opts.payload, "utf8")
    .digest("base64");
  const left = Buffer.from(opts.signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

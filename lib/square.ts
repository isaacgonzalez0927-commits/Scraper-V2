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

async function request<T>(
  accessToken: string,
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; sandbox?: boolean } = {},
): Promise<T> {
  if (!accessToken) throw new SquareError("No Square access token is configured.");
  const method = opts.method || "GET";
  let response: Response;
  try {
    response = await fetch(`${baseUrl(opts.sandbox)}${path}`, {
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

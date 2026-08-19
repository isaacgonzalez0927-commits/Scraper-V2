/**
 * PayPal Checkout over HTTPS. Each shop uses its own REST client id and secret.
 * Amounts leave Sere as integer cents and are formatted to a two-decimal string
 * only at the API boundary.
 */

const LIVE = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";
const SANDBOX = process.env.PAYPAL_SANDBOX_API_BASE || "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PayPalError";
  }
}

function baseUrl(sandbox?: boolean): string {
  return sandbox ? SANDBOX : LIVE;
}

export function paypalAmount(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

async function request<T>(
  accessToken: string,
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; sandbox?: boolean } = {},
): Promise<T> {
  const method = opts.method || "GET";
  let response: Response;
  try {
    response = await fetch(`${baseUrl(opts.sandbox)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? JSON.stringify(opts.body || {}) : undefined,
    });
  } catch (error) {
    throw new PayPalError(`Could not reach PayPal: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new PayPalError(
      payload.message || payload.error_description || `PayPal returned ${response.status}.`,
      response.status,
    );
  }
  return payload as T;
}

export async function paypalAccessToken(
  clientId: string,
  clientSecret: string,
  sandbox?: boolean,
): Promise<string> {
  if (!clientId || !clientSecret) throw new PayPalError("PayPal client id and secret are required.");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${baseUrl(sandbox)}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
  } catch (error) {
    throw new PayPalError(`Could not reach PayPal: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new PayPalError(payload.error_description || `PayPal returned ${response.status}.`, response.status);
  }
  return payload.access_token;
}

export async function paypalAccountLabel(
  clientId: string,
  clientSecret: string,
  sandbox?: boolean,
): Promise<string> {
  const token = await paypalAccessToken(clientId, clientSecret, sandbox);
  const info = await request<{ name?: string; email?: string }>(token, "/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
    sandbox,
  }).catch(() => ({ name: "", email: "" }));
  return info.name || info.email || (sandbox ? "PayPal sandbox" : "PayPal account");
}

export type PayPalOrder = {
  id?: string;
  status?: string;
  links?: { rel?: string; href?: string }[];
  purchase_units?: { amount?: { value?: string }; custom_id?: string }[];
};

export async function createPayPalOrder(
  clientId: string,
  clientSecret: string,
  opts: {
    amountCents: number;
    description: string;
    customId: string;
    returnUrl: string;
    cancelUrl: string;
    brandName?: string;
    sandbox?: boolean;
  },
): Promise<{ id: string; url: string }> {
  const token = await paypalAccessToken(clientId, clientSecret, opts.sandbox);
  const order = await request<PayPalOrder>(token, "/v2/checkout/orders", {
    method: "POST",
    sandbox: opts.sandbox,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: opts.customId,
          description: opts.description,
          amount: { currency_code: "USD", value: paypalAmount(opts.amountCents) },
        },
      ],
      application_context: {
        brand_name: opts.brandName,
        user_action: "PAY_NOW",
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    },
  });
  const url = order.links?.find((link) => link.rel === "approve")?.href || "";
  if (!order.id || !url) throw new PayPalError("PayPal did not return a checkout page.");
  return { id: order.id, url };
}

export async function capturePayPalOrder(
  clientId: string,
  clientSecret: string,
  orderId: string,
  sandbox?: boolean,
): Promise<PayPalOrder> {
  const token = await paypalAccessToken(clientId, clientSecret, sandbox);
  return request<PayPalOrder>(token, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    sandbox,
    body: {},
  });
}

export async function retrievePayPalOrder(
  clientId: string,
  clientSecret: string,
  orderId: string,
  sandbox?: boolean,
): Promise<PayPalOrder> {
  const token = await paypalAccessToken(clientId, clientSecret, sandbox);
  return request<PayPalOrder>(token, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { sandbox });
}

export function paypalOrderPaid(order: PayPalOrder): boolean {
  return order.status === "COMPLETED";
}

export function paypalOrderAmountCents(order: PayPalOrder): number {
  const value = order.purchase_units?.[0]?.amount?.value || "0";
  return Math.round(Number(value) * 100);
}

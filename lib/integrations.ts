import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";
import { db, nowISO } from "./db";
import { integrations, organizations } from "./schema";
import { deauthorizeStripeConnect, stripePlatformSecret } from "./stripe";

/**
 * Each shop connects its own accounts. Stripe is read so the shop can see
 * live cash on Overview. Sere never holds a shared merchant account.
 *
 * Credentials live in one encrypted JSON blob per provider so adding a
 * provider never needs a database migration.
 */

export type Provider = "stripe" | "email" | "square" | "paypal" | "quickbooks";

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  stripeAccount?: string;
  connectedVia?: "oauth" | "keys" | "env";
};

type StoredStripe = {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
  accountId?: string;
  accessToken?: string;
  refreshToken?: string;
  connectedVia?: string;
};

export type SquareConfig = {
  accessToken: string;
  locationId: string;
  webhookSignatureKey: string;
  sandbox: boolean;
};

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  sandbox: boolean;
};

export type QuickBooksConfig = {
  accessToken: string;
  realmId: string;
  sandbox: boolean;
};

export type EmailConfig = {
  provider: "resend";
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export type IntegrationRecord = {
  provider: Provider;
  status: string;
  label: string;
  updatedAt: string;
};

export const PROVIDER_NAMES: Record<Provider, string> = {
  stripe: "Stripe",
  email: "Email",
  square: "Square",
  paypal: "PayPal",
  quickbooks: "QuickBooks",
};

export async function readIntegration(
  organizationId: number,
  provider: Provider,
): Promise<IntegrationRecord | null> {
  const [row] = await db()
    .select()
    .from(integrations)
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)));
  if (!row || row.status !== "connected") return null;
  return { provider, status: row.status, label: row.label, updatedAt: row.updatedAt };
}

async function readConfig<T>(organizationId: number, provider: Provider): Promise<T | null> {
  const [row] = await db()
    .select()
    .from(integrations)
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)));
  if (!row || row.status !== "connected") return null;
  const plain = decryptSecret(row.secretCipher);
  if (!plain) return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}

export async function saveIntegration(
  organizationId: number,
  provider: Provider,
  config: Record<string, string | boolean>,
  label: string,
): Promise<void> {
  const now = nowISO();
  const values = {
    organizationId,
    provider,
    status: "connected",
    label,
    secretCipher: encryptSecret(JSON.stringify(config)),
    updatedAt: now,
  };
  const existing = await db()
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)));
  if (existing.length) {
    await db().update(integrations).set(values).where(eq(integrations.id, existing[0].id));
  } else {
    await db().insert(integrations).values({ ...values, createdAt: now });
  }
  if (provider === "stripe") {
    await db()
      .update(organizations)
      .set({ stripeStatus: "connected" })
      .where(eq(organizations.id, organizationId));
  }
}

export async function disconnectIntegration(organizationId: number, provider: Provider): Promise<void> {
  if (provider === "stripe") {
    const saved = await readConfig<StoredStripe>(organizationId, "stripe");
    if (saved?.accountId) await deauthorizeStripeConnect(saved.accountId);
  }
  await db()
    .update(integrations)
    .set({ status: "disconnected", secretCipher: "", label: "", updatedAt: nowISO() })
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)));
  if (provider === "stripe") {
    await db()
      .update(organizations)
      .set({ stripeStatus: "not_connected" })
      .where(eq(organizations.id, organizationId));
  }
}

/** Deployment-wide Stripe keys. A single-shop install can skip the connect screen. */
export function stripeEnvConfig(): StripeConfig | null {
  // When Connect is on, STRIPE_SECRET_KEY is Sere's platform key, not a shop account.
  if (process.env.STRIPE_CONNECT_CLIENT_ID) return null;
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) return null;
  return {
    secretKey,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    connectedVia: "env",
  };
}

function fromStoredStripe(saved: StoredStripe): StripeConfig | null {
  if (saved.accountId && saved.connectedVia === "oauth") {
    const platform = stripePlatformSecret();
    const secretKey = platform || saved.accessToken || "";
    if (!secretKey) return null;
    return {
      secretKey,
      publishableKey: saved.publishableKey || "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || saved.webhookSecret || "",
      stripeAccount: platform ? saved.accountId : undefined,
      connectedVia: "oauth",
    };
  }
  if (saved.secretKey) {
    return {
      secretKey: saved.secretKey,
      publishableKey: saved.publishableKey || "",
      webhookSecret: saved.webhookSecret || "",
      connectedVia: "keys",
    };
  }
  return null;
}

export async function stripeConfig(organizationId: number): Promise<StripeConfig | null> {
  const saved = await readConfig<StoredStripe>(organizationId, "stripe");
  if (saved) {
    const resolved = fromStoredStripe(saved);
    if (resolved) return resolved;
  }
  return stripeEnvConfig();
}

export function emailEnvConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) return null;
  return {
    provider: "resend",
    apiKey,
    fromEmail: process.env.SERE_EMAIL_FROM || "",
    fromName: process.env.SERE_EMAIL_FROM_NAME || "",
    replyTo: "",
  };
}

export async function emailConfig(organizationId: number): Promise<EmailConfig | null> {
  const saved = await readConfig<EmailConfig>(organizationId, "email");
  if (saved?.apiKey && saved.fromEmail) return saved;
  const fromEnv = emailEnvConfig();
  return fromEnv?.fromEmail ? fromEnv : null;
}

export async function squareConfig(organizationId: number): Promise<SquareConfig | null> {
  const saved = await readConfig<SquareConfig>(organizationId, "square");
  if (saved?.accessToken) {
    return {
      accessToken: saved.accessToken,
      locationId: saved.locationId || "",
      webhookSignatureKey: saved.webhookSignatureKey || "",
      sandbox: Boolean(saved.sandbox),
    };
  }
  return null;
}

export async function paypalConfig(organizationId: number): Promise<PayPalConfig | null> {
  const saved = await readConfig<PayPalConfig>(organizationId, "paypal");
  if (saved?.clientId && saved.clientSecret) {
    return {
      clientId: saved.clientId,
      clientSecret: saved.clientSecret,
      webhookId: saved.webhookId || "",
      sandbox: Boolean(saved.sandbox),
    };
  }
  return null;
}

export async function quickbooksConfig(organizationId: number): Promise<QuickBooksConfig | null> {
  const saved = await readConfig<QuickBooksConfig>(organizationId, "quickbooks");
  if (saved?.accessToken && saved.realmId) {
    return {
      accessToken: saved.accessToken,
      realmId: saved.realmId,
      sandbox: Boolean(saved.sandbox),
    };
  }
  return null;
}

export type OnlinePayMethods = {
  stripe: boolean;
  square: boolean;
  paypal: boolean;
};

export async function onlinePayMethods(organizationId: number): Promise<OnlinePayMethods> {
  const [stripe, square, paypal] = await Promise.all([
    stripeConfig(organizationId),
    squareConfig(organizationId),
    paypalConfig(organizationId),
  ]);
  return {
    stripe: Boolean(stripe?.secretKey),
    square: Boolean(square?.accessToken),
    paypal: Boolean(paypal?.clientId && paypal?.clientSecret),
  };
}

export type ProviderStatus = {
  connected: boolean;
  fromEnv: boolean;
  /** True when a row says connected but its secret no longer decrypts. */
  unreadable: boolean;
  viaOAuth: boolean;
  label: string;
  updatedAt: string;
};

/**
 * What the settings screen shows. A saved secret that no longer decrypts, which
 * is what a rotated SERE_SECRET_KEY looks like, is reported instead of quietly
 * behaving as if the shop were connected.
 */
export async function integrationStatus(
  organizationId: number,
): Promise<{
  stripe: ProviderStatus;
  email: ProviderStatus;
  square: ProviderStatus;
  paypal: ProviderStatus;
  quickbooks: ProviderStatus;
}> {
  const [stripeRow, emailRow, squareRow, paypalRow, qbRow, stripeSaved, emailSaved, squareSaved, paypalSaved, qbSaved] =
    await Promise.all([
      readIntegration(organizationId, "stripe"),
      readIntegration(organizationId, "email"),
      readIntegration(organizationId, "square"),
      readIntegration(organizationId, "paypal"),
      readIntegration(organizationId, "quickbooks"),
      readConfig<StoredStripe>(organizationId, "stripe"),
      readConfig<EmailConfig>(organizationId, "email"),
      readConfig<SquareConfig>(organizationId, "square"),
      readConfig<PayPalConfig>(organizationId, "paypal"),
      readConfig<QuickBooksConfig>(organizationId, "quickbooks"),
    ]);
  const stripeEnv = stripeEnvConfig();
  const emailEnv = emailEnvConfig();
  const stripeReady = Boolean(stripeSaved && fromStoredStripe(stripeSaved));
  const stripeUnreadable = Boolean(stripeRow) && !stripeReady;
  const emailUnreadable = Boolean(emailRow) && !emailSaved?.apiKey;
  const squareUnreadable = Boolean(squareRow) && !squareSaved?.accessToken;
  const paypalUnreadable = Boolean(paypalRow) && !(paypalSaved?.clientId && paypalSaved?.clientSecret);
  const qbUnreadable = Boolean(qbRow) && !(qbSaved?.accessToken && qbSaved?.realmId);

  function status(
    row: IntegrationRecord | null,
    ready: boolean,
    unreadable: boolean,
    fromEnv = false,
    envLabel = "",
    viaOAuth = false,
  ): ProviderStatus {
    return {
      connected: (Boolean(row) && !unreadable) || fromEnv,
      fromEnv: !row && fromEnv,
      unreadable: unreadable && !fromEnv,
      viaOAuth,
      label: row?.label || envLabel,
      updatedAt: row?.updatedAt || "",
    };
  }

  return {
    stripe: status(
      stripeRow,
      stripeReady,
      stripeUnreadable,
      Boolean(stripeEnv),
      stripeEnv ? "Deployment environment keys" : "",
      stripeSaved?.connectedVia === "oauth" && stripeReady,
    ),
    email: status(
      emailRow,
      Boolean(emailSaved?.apiKey),
      emailUnreadable,
      Boolean(emailEnv?.fromEmail),
      emailEnv?.fromEmail || "",
    ),
    square: status(squareRow, Boolean(squareSaved?.accessToken), squareUnreadable),
    paypal: status(
      paypalRow,
      Boolean(paypalSaved?.clientId && paypalSaved?.clientSecret),
      paypalUnreadable,
    ),
    quickbooks: status(qbRow, Boolean(qbSaved?.accessToken && qbSaved?.realmId), qbUnreadable),
  };
}

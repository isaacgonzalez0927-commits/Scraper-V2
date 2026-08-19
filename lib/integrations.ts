import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";
import { db, nowISO } from "./db";
import { integrations, organizations } from "./schema";
import { deauthorizeStripeConnect, stripePlatformSecret } from "./stripe";

/**
 * Each shop connects its own accounts. Sere never holds a shared merchant
 * account, so money moves straight from the customer to the shop.
 *
 * Credentials live in one encrypted JSON blob per provider so adding a
 * provider never needs a database migration.
 */

export type Provider = "stripe" | "email";

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
  config: Record<string, string>,
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
): Promise<{ stripe: ProviderStatus; email: ProviderStatus }> {
  const [stripeRow, emailRow, stripeSaved, emailSaved] = await Promise.all([
    readIntegration(organizationId, "stripe"),
    readIntegration(organizationId, "email"),
    readConfig<StoredStripe>(organizationId, "stripe"),
    readConfig<EmailConfig>(organizationId, "email"),
  ]);
  const stripeEnv = stripeEnvConfig();
  const emailEnv = emailEnvConfig();
  const stripeReady = Boolean(stripeSaved && fromStoredStripe(stripeSaved));
  const stripeUnreadable = Boolean(stripeRow) && !stripeReady;
  const emailUnreadable = Boolean(emailRow) && !emailSaved?.apiKey;

  return {
    stripe: {
      connected: (Boolean(stripeRow) && !stripeUnreadable) || Boolean(stripeEnv),
      fromEnv: !stripeRow && Boolean(stripeEnv),
      unreadable: stripeUnreadable && !stripeEnv,
      viaOAuth: stripeSaved?.connectedVia === "oauth" && stripeReady,
      label: stripeRow?.label || (stripeEnv ? "Deployment environment keys" : ""),
      updatedAt: stripeRow?.updatedAt || "",
    },
    email: {
      connected: (Boolean(emailRow) && !emailUnreadable) || Boolean(emailEnv?.fromEmail),
      fromEnv: !emailRow && Boolean(emailEnv?.fromEmail),
      unreadable: emailUnreadable && !emailEnv?.fromEmail,
      viaOAuth: false,
      label: emailRow?.label || emailEnv?.fromEmail || "",
      updatedAt: emailRow?.updatedAt || "",
    },
  };
}

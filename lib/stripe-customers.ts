/**
 * Two-way customer relay with Stripe.
 *
 * Sere → Stripe  saving a customer creates or updates the Stripe Customer
 *                (needs Customers: Write on the restricted key).
 * Stripe → Sere  customer.created / updated / deleted webhooks upsert or
 *                archive the matching Sere customer, without duplicating.
 *
 * Match order: stripe_customer_id, then metadata.sere_customer_id, then email.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db, nowISO } from "./db";
import { stripeConfig } from "./integrations";
import {
  createStripeCustomer,
  listStripeCustomers,
  retrieveStripeCustomer,
  StripeError,
  updateStripeCustomer,
  type StripeAddress,
  type StripeCustomer,
} from "./stripe";
import { customers } from "./schema";

export type CustomerSyncResult = {
  ok: boolean;
  skipped?: string;
  stripeCustomerId?: string;
  created?: boolean;
  error?: string;
};

export type CustomerIngestResult = {
  customerId: number;
  created: boolean;
};

export function stripeCustomerEventNames(): string[] {
  return ["customer.created", "customer.updated", "customer.deleted"];
}

export function pickLinkedSereCustomer(opts: {
  byStripeId?: number;
  byMetadataId?: number;
  byEmail?: number;
}): number | undefined {
  return opts.byStripeId || opts.byMetadataId || opts.byEmail;
}

export function stripeDashboardCustomerUrl(
  stripeCustomerId: string,
  secretKey?: string,
): string {
  const test = (secretKey || "").includes("_test_");
  const host = test
    ? "https://dashboard.stripe.com/test/customers/"
    : "https://dashboard.stripe.com/customers/";
  return `${host}${encodeURIComponent(stripeCustomerId)}`;
}

export function customerWriteHint(message: string): string {
  if (
    /rak_customer/i.test(message) ||
    /required permissions/i.test(message)
  ) {
    return (
      "The Stripe key needs Customers set to Write. Open Stripe Developers " +
      "(sandbox), create a new restricted key, tick Customize permissions, " +
      "set Customers to Write, then paste the new rk_test_ key."
    );
  }
  return message;
}

type SereCustomer = typeof customers.$inferSelect;

function stripeOpts(config: { stripeAccount?: string }) {
  return { stripeAccount: config.stripeAccount };
}

function billingAddress(customer: SereCustomer): StripeAddress | undefined {
  if (!customer.billingLine1 && !customer.billingCity && !customer.billingPostal) {
    return undefined;
  }
  return {
    line1: customer.billingLine1 || undefined,
    city: customer.billingCity || undefined,
    state: customer.billingState || undefined,
    postal_code: customer.billingPostal || undefined,
    country: "US",
  };
}

function payloadFromSere(customer: SereCustomer, organizationId: number) {
  return {
    name: customer.name,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    address: billingAddress(customer),
    metadata: {
      sere_customer_id: customer.id,
      sere_organization_id: organizationId,
      sere_company_name: customer.companyName || "",
    },
  };
}

export function sereFieldsFromStripeCustomer(
  remote: StripeCustomer,
  existing?: Partial<SereCustomer>,
): {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  billingLine1: string;
  billingCity: string;
  billingState: string;
  billingPostal: string;
} {
  const address = remote.address || {};
  return {
    name: remote.name || existing?.name || remote.email || "Stripe customer",
    email: remote.email || existing?.email || "",
    phone: remote.phone || existing?.phone || "",
    companyName: remote.metadata?.sere_company_name || existing?.companyName || "",
    billingLine1: address.line1 || existing?.billingLine1 || "",
    billingCity: address.city || existing?.billingCity || "",
    billingState: address.state || existing?.billingState || "",
    billingPostal: address.postal_code || existing?.billingPostal || "",
  };
}

/**
 * Create or update the Stripe Customer for a Sere customer. Best-effort: a
 * missing Write permission must not block saving the shop's own book.
 */
export async function pushCustomerToStripe(
  organizationId: number,
  customerId: number,
): Promise<CustomerSyncResult> {
  const config = await stripeConfig(organizationId);
  if (!config?.secretKey) return { ok: false, skipped: "Stripe is not connected." };

  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)));
  if (!customer) return { ok: false, skipped: "Customer not found." };

  try {
    const stripeCustomerId = await ensureStripeCustomer(
      organizationId,
      customer,
      config.secretKey,
      config.stripeAccount,
    );
    return { ok: true, stripeCustomerId };
  } catch (error) {
    return { ok: false, error: customerWriteHint((error as Error).message) };
  }
}

export async function ensureStripeCustomer(
  organizationId: number,
  customerOrId: number | SereCustomer,
  secretKey: string,
  stripeAccount?: string,
): Promise<string> {
  const customer =
    typeof customerOrId === "number"
      ? (
          await db()
            .select()
            .from(customers)
            .where(
              and(eq(customers.id, customerOrId), eq(customers.organizationId, organizationId)),
            )
        )[0]
      : customerOrId;
  if (!customer) throw new StripeError("Customer not found.");

  const payload = payloadFromSere(customer, organizationId);
  if (customer.stripeCustomerId) {
    try {
      await retrieveStripeCustomer(secretKey, customer.stripeCustomerId, { stripeAccount });
      await updateStripeCustomer(secretKey, customer.stripeCustomerId, {
        ...payload,
        stripeAccount,
      });
      return customer.stripeCustomerId;
    } catch {
      // Stale id. Create a new one below.
    }
  }

  const created = await createStripeCustomer(secretKey, {
    ...payload,
    stripeAccount,
    idempotencyKey: `sere-cust-${organizationId}-${customer.id}`,
  });
  await db()
    .update(customers)
    .set({ stripeCustomerId: created.id })
    .where(eq(customers.id, customer.id));
  return created.id;
}

export async function findOrCreateSereCustomer(opts: {
  organizationId: number;
  stripeCustomerId: string;
  secretKey?: string;
  stripeAccount?: string;
  remote?: StripeCustomer | null;
  fallbackName?: string;
  fallbackEmail?: string;
}): Promise<{ id: number; created: boolean }> {
  const [existing] = await db()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, opts.organizationId),
        eq(customers.stripeCustomerId, opts.stripeCustomerId),
      ),
    );
  if (existing) return { id: existing.id, created: false };

  let remote = opts.remote || null;
  if (!remote && opts.secretKey) {
    try {
      remote = await retrieveStripeCustomer(opts.secretKey, opts.stripeCustomerId, {
        stripeAccount: opts.stripeAccount,
      });
    } catch {
      remote = null;
    }
  }

  const metadataId = Number(remote?.metadata?.sere_customer_id || 0);
  let byMetadata: { id: number } | undefined;
  if (metadataId) {
    [byMetadata] = await db()
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, metadataId), eq(customers.organizationId, opts.organizationId)));
  }

  const email = remote?.email || opts.fallbackEmail || "";
  let byEmail: { id: number } | undefined;
  if (email) {
    [byEmail] = await db()
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, opts.organizationId),
          eq(customers.email, email),
          eq(customers.stripeCustomerId, ""),
        ),
      );
  }

  const linkedId = pickLinkedSereCustomer({
    byMetadataId: byMetadata?.id,
    byEmail: byEmail?.id,
  });
  if (linkedId) {
    await db()
      .update(customers)
      .set({ stripeCustomerId: opts.stripeCustomerId })
      .where(eq(customers.id, linkedId));
    return { id: linkedId, created: false };
  }

  const fields = sereFieldsFromStripeCustomer(remote || { id: opts.stripeCustomerId }, {
    name: opts.fallbackName || "",
    email,
  });
  const [created] = await db()
    .insert(customers)
    .values({
      organizationId: opts.organizationId,
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      companyName: fields.companyName,
      billingLine1: fields.billingLine1,
      billingCity: fields.billingCity,
      billingState: fields.billingState,
      billingPostal: fields.billingPostal,
      stripeCustomerId: opts.stripeCustomerId,
      customerSince: nowISO().slice(0, 10),
      createdAt: nowISO(),
    })
    .returning({ id: customers.id });
  return { id: created.id, created: true };
}

/**
 * Import or update a Stripe Customer into Sere. Used by the webhook and by
 * the shop's Sync with Stripe button.
 */
export async function ingestStripeCustomer(
  organizationId: number,
  remote: StripeCustomer,
): Promise<CustomerIngestResult | null> {
  if (!remote.id) return null;
  const metadataOrg = Number(remote.metadata?.sere_organization_id || 0);
  if (metadataOrg && metadataOrg !== organizationId) return null;

  if (remote.deleted) {
    const [existing] = await db()
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, organizationId),
          eq(customers.stripeCustomerId, remote.id),
        ),
      );
    if (!existing) return null;
    if (!existing.archivedAt) {
      await db()
        .update(customers)
        .set({ archivedAt: nowISO() })
        .where(eq(customers.id, existing.id));
    }
    return { customerId: existing.id, created: false };
  }

  const found = await findOrCreateSereCustomer({
    organizationId,
    stripeCustomerId: remote.id,
    remote,
  });
  const customerId = found.id;
  const created = found.created;
  const [row] = await db()
    .select()
    .from(customers)
    .where(eq(customers.id, customerId));
  if (row) {
    const fields = sereFieldsFromStripeCustomer(remote, row);
    await db()
      .update(customers)
      .set(fields)
      .where(eq(customers.id, customerId));
  }
  return { customerId, created };
}

export async function syncCustomersWithStripe(organizationId: number): Promise<{
  ok: boolean;
  createdInSere: number;
  updatedInSere: number;
  pushed: number;
  error?: string;
}> {
  const config = await stripeConfig(organizationId);
  if (!config?.secretKey) {
    return {
      ok: false,
      createdInSere: 0,
      updatedInSere: 0,
      pushed: 0,
      error: "Connect Stripe first.",
    };
  }

  let createdInSere = 0;
  let updatedInSere = 0;
  try {
    let startingAfter: string | undefined;
    let pulled = 0;
    const max = 500;
    while (pulled < max) {
      const page = await listStripeCustomers(config.secretKey, {
        limit: Math.min(100, max - pulled),
        startingAfter,
        ...stripeOpts(config),
      });
      for (const remote of page.data) {
        const result = await ingestStripeCustomer(organizationId, remote);
        if (result?.created) createdInSere += 1;
        else if (result) updatedInSere += 1;
      }
      pulled += page.data.length;
      if (!page.hasMore || !page.data.length) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch (error) {
    return {
      ok: false,
      createdInSere,
      updatedInSere,
      pushed: 0,
      error: customerWriteHint((error as Error).message),
    };
  }

  const local = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), isNull(customers.archivedAt)));
  let pushed = 0;
  for (const customer of local) {
    try {
      await ensureStripeCustomer(
        organizationId,
        customer,
        config.secretKey,
        config.stripeAccount,
      );
      pushed += 1;
    } catch (error) {
      return {
        ok: false,
        createdInSere,
        updatedInSere,
        pushed,
        error: customerWriteHint((error as Error).message),
      };
    }
  }

  return { ok: true, createdInSere, updatedInSere, pushed };
}

export function describeCustomerSync(result: Awaited<ReturnType<typeof syncCustomersWithStripe>>): string {
  if (!result.ok) return result.error || "Could not sync customers with Stripe.";
  const parts = [
    `Brought ${result.createdInSere} Stripe ${result.createdInSere === 1 ? "customer" : "customers"} into Sere`,
    `updated ${result.updatedInSere} already linked`,
    `sent ${result.pushed} Sere ${result.pushed === 1 ? "customer" : "customers"} to Stripe`,
  ];
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
}

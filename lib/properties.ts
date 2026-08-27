import { and, eq } from "drizzle-orm";
import { customerContacts, customers, properties } from "./schema";
import { db, nowISO, token } from "./db";
import { formatAddress } from "./display";

export type Property = typeof properties.$inferSelect;
export type CustomerContact = typeof customerContacts.$inferSelect;
type Customer = typeof customers.$inferSelect;

export function propertyLabel(property: {
  label?: string | null;
  line1?: string;
  city?: string;
}): string {
  const named = (property.label || "").trim();
  if (named && named !== "Service") return named;
  const street = (property.line1 || "").trim();
  if (street) return street;
  const city = (property.city || "").trim();
  return city || named || "Service";
}

export async function listProperties(
  organizationId: number,
  customerId: number,
): Promise<Property[]> {
  return db()
    .select()
    .from(properties)
    .where(and(eq(properties.organizationId, organizationId), eq(properties.customerId, customerId)));
}

/** First property is the service address already on the customer. */
export async function ensureDefaultProperty(
  organizationId: number,
  customer: Customer,
): Promise<Property> {
  const existing = await listProperties(organizationId, customer.id);
  if (existing[0]) return existing[0];
  const [created] = await db()
    .insert(properties)
    .values({
      organizationId,
      customerId: customer.id,
      label: "Service",
      line1: customer.serviceLine1 || customer.billingLine1 || "",
      city: customer.serviceCity || customer.billingCity || "",
      state: customer.serviceState || customer.billingState || "",
      postal: customer.servicePostal || customer.billingPostal || "",
      notes: "",
      details: "{}",
      createdAt: nowISO(),
    })
    .returning();
  return created;
}

export function formatProperty(property: {
  line1: string;
  city: string;
  state: string;
  postal: string;
}): string {
  return formatAddress(property.line1, property.city, property.state, property.postal);
}

export async function listContacts(
  organizationId: number,
  customerId: number,
): Promise<CustomerContact[]> {
  return db()
    .select()
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.organizationId, organizationId),
        eq(customerContacts.customerId, customerId),
      ),
    );
}

/** Public hub token. Generated on first use so old rows without one still work. */
export async function ensureCustomerPublicToken(
  organizationId: number,
  customer: Customer,
): Promise<string> {
  if (customer.publicToken) return customer.publicToken;
  const publicToken = token();
  await db()
    .update(customers)
    .set({ publicToken })
    .where(and(eq(customers.id, customer.id), eq(customers.organizationId, organizationId)));
  return publicToken;
}

"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, nowISO, token } from "@/lib/db";
import { logActivity } from "@/lib/finance";
import {
  matchImportedCustomer,
  parseCustomerCsv,
} from "@/lib/customer-import";
import { ensureDefaultProperty } from "@/lib/properties";
import { customerContacts, customers, jobs, properties } from "@/lib/schema";
import { requireWritableContext } from "@/lib/trial";

function str(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

export async function saveFollowUpAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const id = Number(str(form, "customer_id"));
  const [customer] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
  if (!customer) redirect("/customers");
  await db()
    .update(customers)
    .set({
      followUpOn: str(form, "follow_up_on") || null,
      followUpNote: str(form, "follow_up_note"),
    })
    .where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
  redirect(`/customers/${id}`);
}

export async function savePropertyAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const customerId = Number(str(form, "customer_id"));
  const id = Number(str(form, "id") || 0);
  const [customer] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, org.id)));
  if (!customer) redirect("/customers");
  const row = {
    label: str(form, "label") || "Service",
    line1: str(form, "line1"),
    city: str(form, "city"),
    state: str(form, "state"),
    postal: str(form, "postal"),
    notes: str(form, "notes"),
  };
  if (id) {
    await db()
      .update(properties)
      .set(row)
      .where(
        and(
          eq(properties.id, id),
          eq(properties.organizationId, org.id),
          eq(properties.customerId, customerId),
        ),
      );
  } else {
    await db().insert(properties).values({
      ...row,
      organizationId: org.id,
      customerId,
      details: "{}",
      createdAt: nowISO(),
    });
  }
  redirect(`/customers/${customerId}`);
}

export async function deletePropertyAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const customerId = Number(str(form, "customer_id"));
  const id = Number(str(form, "id"));
  const owned = await db()
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, id),
        eq(properties.organizationId, org.id),
        eq(properties.customerId, customerId),
      ),
    );
  if (!owned.length) redirect(`/customers/${customerId}`);
  await db()
    .update(jobs)
    .set({ propertyId: null })
    .where(and(eq(jobs.organizationId, org.id), eq(jobs.propertyId, id)));
  await db()
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.organizationId, org.id)));
  redirect(`/customers/${customerId}`);
}

export async function saveCustomerContactAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const customerId = Number(str(form, "customer_id"));
  const name = str(form, "name");
  if (!name) redirect(`/customers/${customerId}?error=${encodeURIComponent("A name is required.")}`);
  const [customer] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, org.id)));
  if (!customer) redirect("/customers");
  await db().insert(customerContacts).values({
    organizationId: org.id,
    customerId,
    name,
    role: str(form, "role"),
    phone: str(form, "phone"),
    email: str(form, "email"),
    createdAt: nowISO(),
  });
  redirect(`/customers/${customerId}`);
}

export async function deleteCustomerContactAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const customerId = Number(str(form, "customer_id"));
  const id = Number(str(form, "id"));
  await db()
    .delete(customerContacts)
    .where(
      and(
        eq(customerContacts.id, id),
        eq(customerContacts.organizationId, org.id),
        eq(customerContacts.customerId, customerId),
      ),
    );
  redirect(`/customers/${customerId}`);
}

export async function importCustomersAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const uploaded = form.get("file");
  if (!(uploaded instanceof File) || uploaded.size === 0) {
    redirect("/customers?error=" + encodeURIComponent("Choose a CSV file to import."));
  }
  if (uploaded.size > 2_000_000) {
    redirect("/customers?error=" + encodeURIComponent("That file is too large. Keep it under 2 MB."));
  }
  const text = await uploaded.text();
  const incoming = parseCustomerCsv(text);
  if (!incoming.length) {
    redirect(
      "/customers?error=" +
        encodeURIComponent("No customers in that file. Need a header row and a name column."),
    );
  }
  if (incoming.length > 500) {
    redirect("/customers?error=" + encodeURIComponent("Import 500 customers at a time."));
  }
  const existing = await db()
    .select()
    .from(customers)
    .where(eq(customers.organizationId, org.id));
  const matches = existing.map((row) => ({
    email: row.email,
    phone: row.phone,
    name: row.name,
    street: row.serviceLine1 || row.billingLine1,
  }));
  let created = 0;
  let skipped = 0;
  for (const row of incoming) {
    const hit = matchImportedCustomer(
      {
        email: row.email,
        phone: row.phone,
        name: row.name,
        street: row.serviceLine1 || row.billingLine1,
      },
      matches,
    );
    if (hit >= 0) {
      skipped += 1;
      continue;
    }
    const [saved] = await db()
      .insert(customers)
      .values({
        organizationId: org.id,
        name: row.name,
        companyName: row.companyName,
        email: row.email,
        phone: row.phone,
        billingLine1: row.billingLine1,
        billingCity: row.billingCity,
        billingState: row.billingState,
        billingPostal: row.billingPostal,
        serviceLine1: row.serviceLine1,
        serviceCity: row.serviceCity,
        serviceState: row.serviceState,
        servicePostal: row.servicePostal,
        notes: row.notes,
        details: "{}",
        customerSince: new Date().toISOString().slice(0, 10),
        publicToken: token(),
        createdAt: nowISO(),
      })
      .returning();
    await ensureDefaultProperty(org.id, saved);
    matches.push({
      email: saved.email,
      phone: saved.phone,
      name: saved.name,
      street: saved.serviceLine1 || saved.billingLine1,
    });
    created += 1;
  }
  if (created) {
    await logActivity(
      org.id,
      "customers_imported",
      `Imported ${created} customers`,
      null,
      "/customers",
    );
  }
  const bits = [`Imported ${created}.`];
  if (skipped) bits.push(`${skipped} already in the book.`);
  redirect(`/customers?ok=${encodeURIComponent(bits.join(" "))}`);
}

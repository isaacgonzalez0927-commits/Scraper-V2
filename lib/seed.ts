import { eq } from "drizzle-orm";
import { DEMO_PASSWORD_HASH } from "./password";
import { db, nowISO, token } from "./db";
import { deriveStatus, totalsFromLines } from "./finance";
import { formatMoney, lineAmountCents } from "./money";
import {
  activities,
  customers,
  invoiceEvents,
  invoiceLines,
  invoices,
  jobCosts,
  jobs,
  memberships,
  notes,
  notifications,
  organizations,
  payments,
  serviceItems,
  users,
} from "./schema";

export const DEMO_EMAIL = "owner@sere.cash";
export const DEMO_PASSWORD = "harborair";

function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dtOffset(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export async function seedHarborAir() {
  const already = await db().select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (already.length) return;

  const created = nowISO();
  const [existingOrg] = await db()
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "harbor-air"))
    .limit(1);
  if (existingOrg) {
    await db().update(organizations).set({ businessType: "hvac" }).where(eq(organizations.id, existingOrg.id));
    const [owner] = await db()
      .insert(users)
      .values({
        name: "Elena Vasquez",
        email: DEMO_EMAIL,
        passwordHash: DEMO_PASSWORD_HASH,
        createdAt: created,
      })
      .returning();
    await db().insert(memberships).values({
      userId: owner.id,
      organizationId: existingOrg.id,
      role: "owner",
      createdAt: created,
    });
    return;
  }

  const [org] = await db()
    .insert(organizations)
    .values({
      name: "Harbor Air",
      slug: "harbor-air",
      phone: "(239) 555-0148",
      email: "hello@harborair.example",
      addressLine1: "1840 Fowler St",
      city: "Fort Myers",
      state: "FL",
      postalCode: "33901",
      taxId: "27-4419021",
      invoicePrefix: "INV-",
      nextInvoiceNumber: 1050,
      paymentTermsDays: 14,
      defaultInvoiceNotes: "Thank you for trusting Harbor Air. Payment is due within 14 days.",
      defaultTaxBps: 650,
      businessType: "hvac",
      createdAt: created,
    })
    .returning();
  const [owner] = await db()
    .insert(users)
    .values({
      name: "Elena Vasquez",
      email: DEMO_EMAIL,
      passwordHash: DEMO_PASSWORD_HASH,
      createdAt: created,
    })
    .returning();
  await db().insert(memberships).values({
    userId: owner.id,
    organizationId: org.id,
    role: "owner",
    createdAt: created,
  });

  const catalog = [
    ["Diagnostic visit", "Same-day inspection", 12900],
    ["AC tune-up", "Seasonal clean and check", 18900],
    ["Capacitor replacement", "Parts and labor", 28500],
    ["3-ton AC replacement", "Equipment, line set, startup", 780000],
    ["Smart thermostat install", "Install and program", 34900],
  ] as const;
  for (const [name, description, price] of catalog) {
    await db().insert(serviceItems).values({
      organizationId: org.id,
      name,
      description,
      unitPriceCents: price,
    });
  }

  async function customer(row: Omit<typeof customers.$inferInsert, "id" | "organizationId" | "createdAt">) {
    const [c] = await db()
      .insert(customers)
      .values({ ...row, organizationId: org.id, createdAt: created })
      .returning();
    return c;
  }

  const john = await customer({
    name: "John Smith",
    companyName: "",
    email: "john.smith@example.com",
    phone: "(239) 555-2201",
    billingLine1: "412 Palm Court",
    billingCity: "Cape Coral",
    billingState: "FL",
    billingPostal: "33904",
    serviceLine1: "412 Palm Court",
    serviceCity: "Cape Coral",
    serviceState: "FL",
    servicePostal: "33904",
    notes: "Prefers morning appointments. Gate code 4412.",
    details: JSON.stringify({
      outdoor_brand: "Carrier 24ACC6",
      outdoor_serial: "2414X12345",
      indoor_brand: "Carrier FV4CNF003",
      filter_size: "16x25x1",
      thermostat: "Nest Learning",
      warranty_until: "2034-04",
      membership: "Comfort Club",
      refrigerant: "R-410A",
    }),
    customerSince: "2023-04-12",
  });
  const coastal = await customer({
    name: "Priya Shah",
    companyName: "Coastal Dental",
    email: "office@coastaldental.example",
    phone: "(239) 555-8810",
    billingLine1: "900 Colonial Blvd",
    billingCity: "Fort Myers",
    billingState: "FL",
    billingPostal: "33907",
    serviceLine1: "900 Colonial Blvd",
    serviceCity: "Fort Myers",
    serviceState: "FL",
    servicePostal: "33907",
    notes: "After-hours only. Building manager: Luis.",
    details: JSON.stringify({
      outdoor_brand: "Trane Precedent 5-ton RTU",
      outdoor_serial: "RTU-110-A",
      filter_size: "20x25x2",
      thermostat: "Honeywell T6 Pro",
      refrigerant: "R-410A",
    }),
    customerSince: "2022-11-03",
  });
  const maria = await customer({
    name: "Maria Alvarez",
    companyName: "",
    email: "maria.alvarez@example.com",
    phone: "(239) 555-0194",
    billingLine1: "18 Mangrove Lane",
    billingCity: "Estero",
    billingState: "FL",
    billingPostal: "33928",
    serviceLine1: "18 Mangrove Lane",
    serviceCity: "Estero",
    serviceState: "FL",
    servicePostal: "33928",
    notes: "",
    details: JSON.stringify({
      outdoor_brand: "Goodman GSX16",
      indoor_brand: "Goodman CAPF",
      filter_size: "20x25x1",
      thermostat: "Honeywell",
      membership: "None",
      refrigerant: "R-410A",
    }),
    customerSince: "2024-01-20",
  });
  const riverside = await customer({
    name: "Tom Nguyen",
    companyName: "Riverside Property Group",
    email: "tom@riversidepg.example",
    phone: "(239) 555-7740",
    billingLine1: "50 Hendry St",
    billingCity: "Fort Myers",
    billingState: "FL",
    billingPostal: "33901",
    serviceLine1: "211 River Rd",
    serviceCity: "North Fort Myers",
    serviceState: "FL",
    servicePostal: "33903",
    notes: "Pays by ACH.",
    customerSince: "2021-08-09",
  });
  const bakery = await customer({
    name: "Hannah Cole",
    companyName: "Oak Street Bakery",
    email: "hannah@oakstreetbakery.example",
    phone: "(239) 555-0912",
    billingLine1: "14 Oak St",
    billingCity: "Fort Myers",
    billingState: "FL",
    billingPostal: "33901",
    serviceLine1: "14 Oak St",
    serviceCity: "Fort Myers",
    serviceState: "FL",
    servicePostal: "33901",
    notes: "",
    customerSince: "2024-09-14",
  });
  const inn = await customer({
    name: "Diane Brooks",
    companyName: "Sunset Inn",
    email: "front@sunsetinn.example",
    phone: "(239) 555-6002",
    billingLine1: "2400 Estero Blvd",
    billingCity: "Fort Myers Beach",
    billingState: "FL",
    billingPostal: "33931",
    serviceLine1: "2400 Estero Blvd",
    serviceCity: "Fort Myers Beach",
    serviceState: "FL",
    servicePostal: "33931",
    notes: "12 PTAC units.",
    details: JSON.stringify({
      outdoor_brand: "Amana PTAC (12 units)",
      filter_size: "14x20x1",
      thermostat: "Unit-mounted",
      membership: "Quarterly PM",
    }),
    customerSince: "2022-03-18",
  });

  const [acReplace] = await db()
    .insert(jobs)
    .values({
      organizationId: org.id,
      customerId: john.id,
      title: "AC replacement",
      description: "Replace failed 3-ton condenser and matching air handler.",
      serviceLine1: john.serviceLine1,
      serviceCity: john.serviceCity,
      serviceState: john.serviceState,
      servicePostal: john.servicePostal,
      scheduledStart: dtOffset(-12, 8),
      status: "completed",
      technicianName: "Marcus Hale",
      estimatedRevenueCents: 840000,
      actualRevenueCents: 840000,
      estimatedCostCents: 510000,
      details: JSON.stringify({
        refrigerant: "R-410A",
        filter_changed: "Yes, 16x25x1 left in the closet",
        charge_lbs: "Factory charge + 0.4 lb",
      }),
      completedAt: dtOffset(-12, 16),
      createdAt: created,
    })
    .returning();
  const [coastalJob] = await db()
    .insert(jobs)
    .values({
      organizationId: org.id,
      customerId: coastal.id,
      title: "Suite 110 no-cool",
      description: "Waiting room is 81°.",
      serviceLine1: coastal.serviceLine1,
      serviceCity: coastal.serviceCity,
      serviceState: coastal.serviceState,
      servicePostal: coastal.servicePostal,
      scheduledStart: dtOffset(0, 10),
      status: "in_progress",
      technicianName: "Marcus Hale",
      estimatedRevenueCents: 42000,
      details: JSON.stringify({
        refrigerant: "R-410A",
        filter_changed: "Clogged 20x25x2, replaced",
        charge_lbs: "None — capacitor first",
      }),
      createdAt: created,
    })
    .returning();
  await db().insert(jobs).values([
    {
      organizationId: org.id,
      customerId: maria.id,
      title: "Upstairs air handler service",
      description: "Annual service plus a noisy blower.",
      serviceLine1: maria.serviceLine1,
      serviceCity: maria.serviceCity,
      serviceState: maria.serviceState,
      servicePostal: maria.servicePostal,
      scheduledStart: dtOffset(2, 13),
      status: "scheduled",
      technicianName: "Sofia Rios",
      estimatedRevenueCents: 36500,
      createdAt: created,
    },
    {
      organizationId: org.id,
      customerId: bakery.id,
      title: "Walk-in cooler repair",
      description: "Replaced start capacitor and cleaned condenser.",
      serviceLine1: bakery.serviceLine1,
      serviceCity: bakery.serviceCity,
      serviceState: bakery.serviceState,
      servicePostal: bakery.servicePostal,
      scheduledStart: dtOffset(-3, 7),
      status: "completed",
      technicianName: "Sofia Rios",
      estimatedRevenueCents: 28500,
      actualRevenueCents: 28500,
      completedAt: dtOffset(-3, 9),
      createdAt: created,
    },
    {
      organizationId: org.id,
      customerId: riverside.id,
      title: "Building 2 condenser clean",
      description: "Waiting on roof access.",
      serviceLine1: riverside.serviceLine1,
      serviceCity: riverside.serviceCity,
      serviceState: riverside.serviceState,
      servicePostal: riverside.servicePostal,
      status: "unscheduled",
      estimatedRevenueCents: 24000,
      createdAt: created,
    },
  ]);

  await db().insert(jobCosts).values([
    { organizationId: org.id, jobId: acReplace.id, category: "equipment", description: "3-ton condenser + air handler", amountCents: 428000, createdAt: created },
    { organizationId: org.id, jobId: acReplace.id, category: "labor", description: "Two-man install", amountCents: 96000, createdAt: created },
    { organizationId: org.id, jobId: acReplace.id, category: "materials", description: "Line set and pad", amountCents: 41200, createdAt: created },
  ]);

  async function makeInvoice(
    number: string,
    customerId: number,
    jobId: number | null,
    issue: string,
    due: string,
    lines: [string, string, number][],
    extra: Partial<typeof invoices.$inferInsert> = {},
  ) {
    const calc = totalsFromLines(
      lines.map(([, qty, price]) => ({ quantity: qty, unitPriceCents: price })),
      0,
      650,
    );
    const [inv] = await db()
      .insert(invoices)
      .values({
        organizationId: org.id,
        customerId,
        jobId,
        number,
        // An invoice with a sent timestamp is not a draft, and deriveStatus below
        // refuses to move a draft along. Without this the demo shows five drafts.
        status: extra.sentAt ? "sent" : "draft",
        issueDate: issue,
        dueDate: due,
        notes: org.defaultInvoiceNotes,
        taxBps: 650,
        publicToken: token(),
        createdAt: created,
        ...calc,
        ...extra,
      })
      .returning();
    for (const [i, [description, quantity, price]] of lines.entries()) {
      await db().insert(invoiceLines).values({
        organizationId: org.id,
        invoiceId: inv.id,
        position: i,
        description,
        quantity,
        unitPriceCents: price,
        amountCents: lineAmountCents(quantity, price),
      });
    }
    return inv;
  }

  const inv1042 = await makeInvoice(
    "INV-1042",
    john.id,
    acReplace.id,
    dayOffset(-14),
    dayOffset(0),
    [
      ["3-ton AC replacement", "1", 780000],
      ["Smart thermostat install", "1", 34900],
      ["Permit and haul-away", "1", 25100],
    ],
    { sentAt: dtOffset(-14, 9), viewedAt: dtOffset(-13, 11) },
  );
  const inv1044 = await makeInvoice(
    "INV-1044",
    bakery.id,
    null,
    dayOffset(-3),
    dayOffset(11),
    [["Walk-in cooler repair", "1", 28500]],
    { sentAt: dtOffset(-3, 10) },
  );
  const inv1045 = await makeInvoice(
    "INV-1045",
    riverside.id,
    null,
    dayOffset(-28),
    dayOffset(-14),
    [
      ["Quarterly maintenance, Building 1", "1", 64000],
      ["Filter set", "4", 2800],
    ],
    { sentAt: dtOffset(-28, 9), viewedAt: dtOffset(-21, 9) },
  );
  const inv1046 = await makeInvoice(
    "INV-1046",
    inn.id,
    null,
    dayOffset(-10),
    dayOffset(4),
    [["PTAC service, rooms 1 through 7", "7", 18500]],
    { sentAt: dtOffset(-10, 9), viewedAt: dtOffset(-8, 9) },
  );
  const inv1047 = await makeInvoice(
    "INV-1047",
    maria.id,
    null,
    dayOffset(-18),
    dayOffset(-4),
    [["AC tune-up, upstairs and downstairs", "2", 18900]],
    { sentAt: dtOffset(-18, 9), viewedAt: dtOffset(-12, 9) },
  );
  await makeInvoice(
    "INV-1048",
    john.id,
    null,
    dayOffset(0),
    dayOffset(14),
    [["Smart thermostat install", "1", 34900]],
  );
  const inv1049 = await makeInvoice(
    "INV-1049",
    coastal.id,
    coastalJob.id,
    dayOffset(0),
    dayOffset(14),
    [
      ["Diagnostic visit", "1", 12900],
      ["After-hours labor", "1", 19500],
    ],
    { sentAt: dtOffset(0, 8), viewedAt: dtOffset(0, 10) },
  );

  await db().insert(payments).values([
    {
      organizationId: org.id,
      customerId: john.id,
      invoiceId: inv1042.id,
      amountCents: inv1042.totalCents,
      paidOn: dayOffset(-2),
      method: "card",
      reference: "ch_4f2a91",
      notes: "",
      createdAt: created,
    },
    {
      organizationId: org.id,
      customerId: inn.id,
      invoiceId: inv1046.id,
      amountCents: 50000,
      paidOn: dayOffset(-5),
      method: "ach",
      reference: "ACH-2291",
      notes: "Partial payment. Remainder next week.",
      createdAt: created,
    },
    {
      organizationId: org.id,
      customerId: coastal.id,
      invoiceId: null,
      amountCents: 12900,
      paidOn: dayOffset(-1),
      method: "card",
      reference: "ch_88c12",
      notes: "Retainer for today's diagnostic.",
      createdAt: created,
    },
  ]);

  for (const inv of [inv1042, inv1044, inv1045, inv1046, inv1047, inv1049]) {
    const paidRows = await db().select().from(payments);
    const paid = paidRows
      .filter((p) => p.invoiceId === inv.id && !p.voidedAt)
      .reduce((s, p) => s + p.amountCents, 0);
    const status = deriveStatus({ ...inv, paidCents: paid });
    await db().update(invoices).set({ status }).where(eq(invoices.id, inv.id));
  }

  await db().insert(invoiceEvents).values([
    { organizationId: org.id, invoiceId: inv1042.id, kind: "created", message: "INV-1042 created", createdAt: dtOffset(-14, 8) },
    { organizationId: org.id, invoiceId: inv1042.id, kind: "sent", message: "Sent to john.smith@example.com", createdAt: dtOffset(-14, 9) },
    { organizationId: org.id, invoiceId: inv1042.id, kind: "viewed", message: "Customer viewed invoice", createdAt: dtOffset(-13, 11) },
    { organizationId: org.id, invoiceId: inv1042.id, kind: "payment", message: `${formatMoney(inv1042.totalCents)} payment received`, amountCents: inv1042.totalCents, createdAt: dtOffset(-2, 15) },
    { organizationId: org.id, invoiceId: inv1042.id, kind: "paid", message: "INV-1042 paid in full", createdAt: dtOffset(-2, 15) },
    { organizationId: org.id, invoiceId: inv1047.id, kind: "overdue", message: "INV-1047 became overdue", createdAt: dtOffset(-4, 8) },
    { organizationId: org.id, invoiceId: inv1046.id, kind: "payment", message: "$500.00 payment received", amountCents: 50000, createdAt: dtOffset(-5, 12) },
  ]);

  await db().insert(notes).values({
    organizationId: org.id,
    customerId: john.id,
    jobId: acReplace.id,
    body: "Homeowner approved the 3-ton after seeing the failed compressor.",
    createdAt: dtOffset(-13, 16),
  });

  await db().insert(activities).values([
    { organizationId: org.id, kind: "payment_received", title: `Invoice INV-1042 paid in full`, amountCents: inv1042.totalCents, link: `/invoices/${inv1042.id}`, createdAt: dtOffset(-2, 15) },
    { organizationId: org.id, kind: "job_created", title: "New job created for Coastal Dental", amountCents: null, link: `/jobs/${coastalJob.id}`, createdAt: dtOffset(0, 7) },
    { organizationId: org.id, kind: "invoice_overdue", title: "Invoice INV-1047 became overdue", amountCents: inv1047.totalCents, link: `/invoices/${inv1047.id}`, createdAt: dtOffset(-4, 8) },
    { organizationId: org.id, kind: "payment_received", title: "Payment received from Coastal Dental", amountCents: 12900, link: "/payments", createdAt: dtOffset(-1, 16) },
    { organizationId: org.id, kind: "job_completed", title: "Job completed: AC replacement", amountCents: 840000, link: `/jobs/${acReplace.id}`, createdAt: dtOffset(-12, 16) },
  ]);

  await db().insert(notifications).values([
    { organizationId: org.id, kind: "invoice_overdue", title: "INV-1047 is overdue", body: "Maria Alvarez still has an open balance.", link: `/invoices/${inv1047.id}`, createdAt: dtOffset(-4, 8) },
    { organizationId: org.id, kind: "invoice_overdue", title: "INV-1045 is overdue", body: "Riverside Property Group still has an open balance.", link: `/invoices/${inv1045.id}`, createdAt: dtOffset(-14, 8) },
    { organizationId: org.id, kind: "payment_received", title: `Payment received, ${formatMoney(inv1042.totalCents)}`, body: "John Smith paid INV-1042 in full.", link: `/invoices/${inv1042.id}`, createdAt: dtOffset(-2, 15) },
    { organizationId: org.id, kind: "invoice_viewed", title: "INV-1049 was viewed", body: "Coastal Dental opened the invoice and has not paid.", link: `/invoices/${inv1049.id}`, createdAt: dtOffset(0, 10) },
  ]);
}

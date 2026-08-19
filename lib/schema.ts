import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  taxId: text("tax_id").notNull().default(""),
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1001),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  defaultInvoiceNotes: text("default_invoice_notes").notNull().default(""),
  defaultTaxBps: integer("default_tax_bps").notNull().default(0),
  stripeStatus: text("stripe_status").notNull().default("not_connected"),
  businessType: text("business_type").notNull().default("general"),
  createdAt: text("created_at").notNull(),
});

/** One row per shop per provider. Credentials are encrypted in secret_cipher. */
export const integrations = sqliteTable(
  "integrations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("disconnected"),
    label: text("label").notNull().default(""),
    secretCipher: text("secret_cipher").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("integrations_org_provider").on(t.organizationId, t.provider)],
);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    role: text("role").notNull().default("owner"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("memberships_user_org").on(t.userId, t.organizationId)],
);

export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    companyName: text("company_name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    billingLine1: text("billing_line1").notNull().default(""),
    billingCity: text("billing_city").notNull().default(""),
    billingState: text("billing_state").notNull().default(""),
    billingPostal: text("billing_postal").notNull().default(""),
    serviceLine1: text("service_line1").notNull().default(""),
    serviceCity: text("service_city").notNull().default(""),
    serviceState: text("service_state").notNull().default(""),
    servicePostal: text("service_postal").notNull().default(""),
    notes: text("notes").notNull().default(""),
    customerSince: text("customer_since").notNull(),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("customers_org").on(t.organizationId)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    serviceLine1: text("service_line1").notNull().default(""),
    serviceCity: text("service_city").notNull().default(""),
    serviceState: text("service_state").notNull().default(""),
    servicePostal: text("service_postal").notNull().default(""),
    scheduledStart: text("scheduled_start"),
    status: text("status").notNull().default("unscheduled"),
    technicianName: text("technician_name").notNull().default(""),
    estimatedRevenueCents: integer("estimated_revenue_cents").notNull().default(0),
    actualRevenueCents: integer("actual_revenue_cents").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    notes: text("notes").notNull().default(""),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("jobs_org").on(t.organizationId)],
);

export const jobCosts = sqliteTable("job_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  category: text("category").notNull().default("miscellaneous"),
  description: text("description").notNull().default(""),
  amountCents: integer("amount_cents").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  customerId: integer("customer_id"),
  jobId: integer("job_id"),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const serviceItems = sqliteTable("service_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
});

export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    jobId: integer("job_id"),
    number: text("number").notNull(),
    status: text("status").notNull().default("draft"),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    notes: text("notes").notNull().default(""),
    discountCents: integer("discount_cents").notNull().default(0),
    taxBps: integer("tax_bps").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    publicToken: text("public_token").notNull().unique(),
    sentAt: text("sent_at"),
    viewedAt: text("viewed_at"),
    voidedAt: text("voided_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("invoices_org_number").on(t.organizationId, t.number),
    index("invoices_org").on(t.organizationId),
  ],
);

export const invoiceLines = sqliteTable("invoice_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  amountCents: integer("amount_cents").notNull().default(0),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  invoiceId: integer("invoice_id"),
  amountCents: integer("amount_cents").notNull(),
  paidOn: text("paid_on").notNull(),
  method: text("method").notNull().default("card"),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  voidedAt: text("voided_at"),
  createdAt: text("created_at").notNull(),
});

export const invoiceEvents = sqliteTable("invoice_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  amountCents: integer("amount_cents"),
  createdAt: text("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link").notNull().default(""),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
});

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  amountCents: integer("amount_cents"),
  link: text("link").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

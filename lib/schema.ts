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
  /** trial until trialEndsAt; shop/crew means billed (or Harbor Air). */
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: text("trial_ends_at").notNull().default(""),
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

/** Nova's running conversation, per shop. */
export const novaMessages = sqliteTable(
  "nova_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("nova_messages_org").on(t.organizationId, t.id)],
);

/** Durable lessons and preferences. Keyed rows update in place. */
export const novaMemory = sqliteTable(
  "nova_memory",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    kind: text("kind").notNull().default("note"),
    key: text("key").notNull().default(""),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("nova_memory_org").on(t.organizationId, t.updatedAt)],
);

/**
 * Nexus: the outreach pipeline Nova commands. Ported from RideBy.
 *
 * These rows are Sere's own prospects, not any shop's customers, so they carry
 * no organizationId. A company moves new → researching → ready → queued →
 * contacted, and every draft waits for a review score before it can send.
 */
export const nexusCompanies = sqliteTable(
  "nexus_companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    placeId: text("place_id").notNull().default(""),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    /** The trade we think they are, which decides the words in the email. */
    trade: text("trade").notNull().default(""),
    reviewCount: integer("review_count").notNull().default(0),
    source: text("source").notNull().default("places"),
    searchQuery: text("search_query").notNull().default(""),
    stage: text("stage").notNull().default("new"),
    disqualifiedReason: text("disqualified_reason").notNull().default(""),
    researchStatus: text("research_status").notNull().default("pending"),
    researchError: text("research_error").notNull().default(""),
    researchPages: integer("research_pages").notNull().default(0),
    /** The one true, specific thing worth opening an email with. */
    fact: text("fact").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("nexus_companies_place").on(t.placeId),
    index("nexus_companies_stage").on(t.stage),
  ],
);

export const nexusContacts = sqliteTable(
  "nexus_contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").notNull().references(() => nexusCompanies.id),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    role: text("role").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    confidence: integer("confidence").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("nexus_contacts_email").on(t.email)],
);

export const nexusDrafts = sqliteTable(
  "nexus_drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").notNull().references(() => nexusCompanies.id),
    contactId: integer("contact_id"),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    model: text("model").notNull().default(""),
    variant: text("variant").notNull().default("a"),
    status: text("status").notNull().default("pending_review"),
    /** 0-100 from the review hand. Below the floor it never sends. */
    confidence: integer("confidence").notNull().default(0),
    rejectionReason: text("rejection_reason").notNull().default(""),
    reviewedAt: text("reviewed_at"),
    sentAt: text("sent_at"),
    providerId: text("provider_id").notNull().default(""),
    openedDemoAt: text("opened_demo_at"),
    repliedAt: text("replied_at"),
    signedUpAt: text("signed_up_at"),
    bouncedAt: text("bounced_at"),
    complainedAt: text("complained_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("nexus_drafts_status").on(t.status), index("nexus_drafts_sent").on(t.sentAt)],
);

/** The work queue. One row per unit of work, with backoff and dedupe. */
export const nexusJobs = sqliteTable(
  "nexus_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    payload: text("payload").notNull().default("{}"),
    status: text("status").notNull().default("queued"),
    runAfter: text("run_after").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    lockedAt: text("locked_at"),
    lastError: text("last_error").notNull().default(""),
    dedupeKey: text("dedupe_key").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("nexus_jobs_ready").on(t.status, t.runAfter)],
);

/** Audit trail. Nova reads this to say what she actually did. */
export const nexusActions = sqliteTable(
  "nexus_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor").notNull().default("nova"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull().default(""),
    entityId: text("entity_id").notNull().default(""),
    detail: text("detail").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("nexus_actions_at").on(t.createdAt)],
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
    details: text("details").notNull().default("{}"),
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
    details: text("details").notNull().default("{}"),
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

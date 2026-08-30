"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boot } from "@/lib/boot";
import {
  clearSession,
  createSession,
  hashPassword,
  requireContext,
  safeAppPath,
  verifyPassword,
} from "@/lib/auth";
import { databaseRefusalMessage, db, isDurableDatabase, nowISO, token } from "@/lib/db";
import { estimateEmail, invoiceEmail, sendEmail } from "@/lib/email";
import {
  addEstimateEvent,
  canEditEstimate,
  convertApprovedEstimate,
  estimateTotals,
  nextEstimateNumber,
} from "@/lib/estimates";
import {
  addEvent,
  applyPayment,
  balanceCents,
  amountPaidCents,
  logActivity,
  nextInvoiceNumber,
  refreshInvoice,
  totalsFromLines,
} from "@/lib/finance";
import { disconnectIntegration, emailConfig, saveIntegration } from "@/lib/integrations";
import {
  collectDetails,
  mergeDetails,
  parseBusinessType,
  parseDetails,
  serializeDetails,
  tradeCopy,
  tradeFieldsFor,
} from "@/lib/business";
import { closeoutDueDate, parseCloseout, parseNoCharge } from "@/lib/closeout";
import { ensureDefaultProperty } from "@/lib/properties";
import { dollarsToCents, formatMoney } from "@/lib/money";
import { prettyDate } from "@/lib/labels";
import { paypalAccountLabel } from "@/lib/paypal";
import { quickBooksCompanyName } from "@/lib/quickbooks";
import { syncQuickbooksBook } from "@/lib/quickbooks-invoices";
import { listSquareLocations, squareAccountLabel } from "@/lib/square";
import { syncSquareBook } from "@/lib/square-invoices";
import { signConnectState, stripeConnectAuthorizeUrl, stripeConnectEnabled } from "@/lib/stripe";
import { validateStripeKeyForSere, stripeKeyDeniedMessage } from "@/lib/stripe-keys";
import {
  describeCustomerSync,
  pushCustomerToStripe,
  syncCustomersWithStripe,
} from "@/lib/stripe-customers";
import {
  describeBookSync,
  markStripePaidIfLinked,
  pushInvoiceToStripe,
  syncStripeBook,
  voidStripeIfLinked,
} from "@/lib/stripe-invoices";
import { DEMO_EMAIL } from "@/lib/seed";
import { isSafeAppPath, withQuery } from "@/lib/sere-setup";
import { parseModeChoice, promoteShopAfterProcessor, stripeKeyEnv, writeShopMode } from "@/lib/shop-mode";
import { requireWritableContext, trialEndsISO } from "@/lib/trial";
import { invoicePayUrl } from "@/lib/phone";
import { absoluteBaseUrl } from "@/lib/url";
import {
  customers,
  estimateLines,
  estimates,
  invoiceLines,
  invoices,
  jobCosts,
  jobs,
  memberships,
  notes,
  properties,
  notifications,
  organizations,
  passwordResets,
  payments,
  serviceItems,
  users,
} from "@/lib/schema";

function str(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function loginAction(form: FormData) {
  await boot();
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const [user] = await db().select().from(users).where(eq(users.email, email));
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    redirect("/login?error=That+email+or+password+is+not+right.");
  }
  const [membership] = await db().select().from(memberships).where(eq(memberships.userId, user.id));
  if (!membership) redirect("/login?error=No+company+on+this+account.");
  await createSession(user.id, membership.organizationId);
  redirect(safeAppPath(str(form, "next")));
}

export async function signupAction(form: FormData) {
  await boot();
  if (!isDurableDatabase()) {
    redirect(`/signup?error=${encodeURIComponent(databaseRefusalMessage() || "Database is not ready.")}`);
  }
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const company = str(form, "company");
  if (!name || !email || !password || !company) {
    redirect("/signup?error=Shop+name,+your+name,+email,+and+password+are+required.");
  }
  if (password.length < 8) redirect("/signup?error=Use+at+least+8+characters.");
  if (str(form, "agree") !== "1") {
    redirect("/signup?error=Agree+to+the+Terms+and+Privacy+Policy+to+create+a+shop.");
  }
  const existing = await db().select().from(users).where(eq(users.email, email));
  if (existing.length) redirect("/signup?error=An+account+with+that+email+already+exists.");
  const created = nowISO();
  const [user] = await db()
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), createdAt: created })
    .returning();
  const [org] = await db()
    .insert(organizations)
    .values({
      name: company,
      slug: slugify(company),
      email,
      plan: "trial",
      trialEndsAt: trialEndsISO(new Date(created)),
      operatingMode: "sandbox",
      createdAt: created,
    })
    .returning();
  await db().insert(memberships).values({ userId: user.id, organizationId: org.id, role: "owner", createdAt: created });
  await createSession(user.id, org.id);
  redirect("/welcome");
}

/**
 * The one setup question. Picking the trade sets the words Sere uses and drops
 * in that trade's starter price list, but only while the shop is still empty.
 */
export async function chooseTradeAction(form: FormData) {
  const { org } = await requireContext();
  const businessType = parseBusinessType(str(form, "business_type"));
  const voice = tradeCopy(businessType);
  await db()
    .update(organizations)
    .set({ businessType, defaultInvoiceNotes: voice.defaultNotes })
    .where(eq(organizations.id, org.id));
  const existing = await db()
    .select({ id: serviceItems.id })
    .from(serviceItems)
    .where(eq(serviceItems.organizationId, org.id));
  if (!existing.length) {
    for (const [n, d, p] of voice.services) {
      await db().insert(serviceItems).values({
        organizationId: org.id,
        name: n,
        description: d,
        unitPriceCents: p,
      });
    }
  }
  redirect("/overview");
}

export async function chooseShopModeAction(form: FormData) {
  const { org, user } = await requireWritableContext("/mode");
  if (user.email === DEMO_EMAIL) redirect("/overview");
  const choice = parseModeChoice(str(form, "mode"));
  if (!choice) redirect("/mode?error=Pick+Live+or+Desk+mode.");
  await writeShopMode(org.id, choice);
  if (choice === "live") {
    redirect(
      "/settings?tab=integrations&ok=" +
        encodeURIComponent("Live mode. Connect Stripe or Square so Overview can show cash that actually landed."),
    );
  }
  redirect(
    "/overview?ok=" +
      encodeURIComponent(
        "Desk mode is on. The shop is live. No Stripe or Square, so Overview will not show cash that actually landed. Connect later when you want that.",
      ),
  );
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

export async function forgotAction(form: FormData) {
  await boot();
  const email = str(form, "email").toLowerCase();
  const [user] = await db().select().from(users).where(eq(users.email, email));
  if (!user) redirect("/forgot?ok=1");
  const resetToken = token();
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await db().insert(passwordResets).values({ userId: user.id, token: resetToken, expiresAt: expires });
  redirect(`/forgot?token=${resetToken}`);
}

export async function resetAction(form: FormData) {
  await boot();
  const resetToken = str(form, "token");
  const password = str(form, "password");
  const [row] = await db().select().from(passwordResets).where(eq(passwordResets.token, resetToken));
  if (!row || row.usedAt || row.expiresAt < nowISO()) redirect("/forgot?error=That+link+expired.");
  if (password.length < 8) redirect(`/reset/${resetToken}?error=Use+at+least+8+characters.`);
  await db().update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId));
  await db().update(passwordResets).set({ usedAt: nowISO() }).where(eq(passwordResets.id, row.id));
  redirect("/login?ok=Password+updated.");
}

export async function saveCustomerAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const id = Number(str(form, "id") || 0);
  const same = str(form, "same_as_billing") === "1";
  const fields = tradeFieldsFor(org.businessType, "customer");
  const incoming = collectDetails(form, fields);
  let details = serializeDetails(incoming);
  if (id) {
    const [existing] = await db()
      .select({ details: customers.details })
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
    if (existing) {
      details = serializeDetails(mergeDetails(parseDetails(existing.details), fields, incoming));
    }
  }
  const row = {
    name: str(form, "name"),
    companyName: str(form, "company_name"),
    email: str(form, "email"),
    phone: str(form, "phone"),
    billingLine1: str(form, "billing_line1"),
    billingCity: str(form, "billing_city"),
    billingState: str(form, "billing_state"),
    billingPostal: str(form, "billing_postal"),
    serviceLine1: same ? str(form, "billing_line1") : str(form, "service_line1"),
    serviceCity: same ? str(form, "billing_city") : str(form, "service_city"),
    serviceState: same ? str(form, "billing_state") : str(form, "service_state"),
    servicePostal: same ? str(form, "billing_postal") : str(form, "service_postal"),
    notes: str(form, "notes"),
    details,
    followUpOn: str(form, "follow_up_on") || null,
    followUpNote: str(form, "follow_up_note"),
    customerSince: str(form, "customer_since") || new Date().toISOString().slice(0, 10),
  };
  const fromSetup = str(form, "setup") === "1";
  const back = isSafeAppPath(str(form, "next")) ? str(form, "next") : "/overview";
  if (!row.name) {
    redirect(
      fromSetup
        ? withQuery(back, "error", "A name is required.")
        : "/customers/new?error=A+customer+name+is+required.",
    );
  }
  let customerId = id;
  if (id) {
    await db().update(customers).set(row).where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
  } else {
    const [created] = await db()
      .insert(customers)
      .values({ ...row, organizationId: org.id, publicToken: token(), createdAt: nowISO() })
      .returning();
    customerId = created.id;
    await ensureDefaultProperty(org.id, created);
    await logActivity(org.id, "customer_created", `New customer: ${created.name}`, null, `/customers/${created.id}`);
  }
  const sync = await pushCustomerToStripe(org.id, customerId);
  if (fromSetup) {
    if (sync.error) redirect(withQuery(back, "error", sync.error));
    redirect(back);
  }
  if (str(form, "next") === "job") {
    redirect(`/jobs/new?customerId=${customerId}`);
  }
  if (sync.error) {
    redirect(`/customers/${customerId}?error=${encodeURIComponent(sync.error)}`);
  }
  redirect(`/customers/${customerId}`);
}

export async function archiveCustomerAction(form: FormData) {
  const { org } = await requireWritableContext("/customers");
  const id = Number(str(form, "id"));
  const [c] = await db().select().from(customers).where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
  if (!c) redirect("/customers");
  await db()
    .update(customers)
    .set({ archivedAt: c.archivedAt ? null : nowISO() })
    .where(eq(customers.id, id));
  redirect(`/customers/${id}`);
}

export async function syncCustomersWithStripeAction() {
  const { org } = await requireWritableContext("/customers");
  const result = await syncCustomersWithStripe(org.id);
  const message = describeCustomerSync(result);
  const key = result.ok ? "ok" : "error";
  redirect(`/customers?${key}=${encodeURIComponent(message)}`);
}

export async function addNoteAction(form: FormData) {
  const { org } = await requireWritableContext("/overview");
  const body = str(form, "body");
  const customerId = Number(str(form, "customer_id") || 0) || null;
  const jobId = Number(str(form, "job_id") || 0) || null;
  if (body) {
    await db().insert(notes).values({ organizationId: org.id, customerId, jobId, body, createdAt: nowISO() });
  }
  redirect(jobId ? `/jobs/${jobId}` : `/customers/${customerId}`);
}

export async function saveJobAction(form: FormData) {
  const { org } = await requireWritableContext("/jobs");
  const id = Number(str(form, "id") || 0);
  const status = str(form, "status") || "unscheduled";
  const scheduledStart = str(form, "scheduled_start") || null;
  const fields = tradeFieldsFor(org.businessType, "job");
  const incoming = collectDetails(form, fields);
  let details = serializeDetails(incoming);
  if (id) {
    const [existing] = await db()
      .select({ details: jobs.details })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.organizationId, org.id)));
    if (existing) {
      details = serializeDetails(mergeDetails(parseDetails(existing.details), fields, incoming));
    }
  }
  const customerId = Number(str(form, "customer_id"));
  const propertyId = Number(str(form, "property_id") || 0) || null;
  let serviceLine1 = str(form, "service_line1");
  let serviceCity = str(form, "service_city");
  let serviceState = str(form, "service_state");
  let servicePostal = str(form, "service_postal");
  let linkedPropertyId: number | null = null;
  if (propertyId && customerId) {
    const [property] = await db()
      .select()
      .from(properties)
      .where(
        and(
          eq(properties.id, propertyId),
          eq(properties.organizationId, org.id),
          eq(properties.customerId, customerId),
        ),
      );
    if (property) {
      linkedPropertyId = property.id;
      serviceLine1 = property.line1;
      serviceCity = property.city;
      serviceState = property.state;
      servicePostal = property.postal;
    }
  }
  const row = {
    customerId,
    propertyId: linkedPropertyId,
    title: str(form, "title"),
    description: str(form, "description"),
    serviceLine1,
    serviceCity,
    serviceState,
    servicePostal,
    scheduledStart,
    status: scheduledStart && status === "unscheduled" ? "scheduled" : status,
    technicianName: str(form, "technician_name"),
    estimatedRevenueCents: dollarsToCents(str(form, "estimated_revenue")),
    actualRevenueCents: dollarsToCents(str(form, "actual_revenue")),
    estimatedCostCents: dollarsToCents(str(form, "estimated_cost")),
    notes: str(form, "notes"),
    details,
    completedAt: status === "completed" ? nowISO() : null,
  };
  const fromSetup = str(form, "setup") === "1";
  const back = isSafeAppPath(str(form, "next")) ? str(form, "next") : "/overview";
  if (!customerId || !row.title) {
    redirect(
      fromSetup
        ? withQuery(back, "error", "A title is required.")
        : "/jobs/new?error=Customer+and+title+are+required.",
    );
  }
  if (id) {
    await db().update(jobs).set(row).where(and(eq(jobs.id, id), eq(jobs.organizationId, org.id)));
    redirect(`/jobs/${id}`);
  }
  const [job] = await db().insert(jobs).values({ ...row, organizationId: org.id, createdAt: nowISO() }).returning();
  await logActivity(org.id, "job_created", `New job: ${job.title}`, job.estimatedRevenueCents, `/jobs/${job.id}`);
  if (fromSetup) redirect(back);
  redirect(`/jobs/${job.id}`);
}

export async function updateJobStatusAction(form: FormData) {
  const { org } = await requireWritableContext("/jobs");
  const id = Number(str(form, "id"));
  const status = str(form, "status");
  const patch: Record<string, string | null> = { status };
  if (status === "completed") patch.completedAt = nowISO();
  await db().update(jobs).set(patch).where(and(eq(jobs.id, id), eq(jobs.organizationId, org.id)));
  if (status === "completed") {
    const [job] = await db().select().from(jobs).where(eq(jobs.id, id));
    await logActivity(org.id, "job_completed", `Job completed: ${job.title}`, job.estimatedRevenueCents, `/jobs/${id}`);
  }
  redirect(`/jobs/${id}`);
}

export async function addJobCostAction(form: FormData) {
  const { org } = await requireWritableContext("/jobs");
  const jobId = Number(str(form, "job_id"));
  const amount = dollarsToCents(str(form, "amount"));
  if (amount > 0) {
    await db().insert(jobCosts).values({
      organizationId: org.id,
      jobId,
      category: str(form, "category") || "miscellaneous",
      description: str(form, "description") || "Cost",
      amountCents: amount,
      createdAt: nowISO(),
    });
  }
  redirect(`/jobs/${jobId}`);
}

export async function rescheduleJobAction(form: FormData) {
  const { org } = await requireWritableContext("/jobs");
  const id = Number(str(form, "id"));
  const scheduledStart = str(form, "scheduled_start");
  await db()
    .update(jobs)
    .set({ scheduledStart, status: "scheduled" })
    .where(and(eq(jobs.id, id), eq(jobs.organizationId, org.id)));
  redirect(str(form, "next") || `/jobs/${id}`);
}

async function invoiceForJob(
  org: typeof organizations.$inferSelect,
  job: typeof jobs.$inferSelect,
  syncDraft = false,
) {
  const existing = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.jobId, job.id), eq(invoices.organizationId, org.id)));
  const open = existing.find((i) => i.status !== "void");
  if (open) {
    if (syncDraft && open.status === "draft") {
      const lines = await db()
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, open.id));
      if (lines.length === 1) {
        const price = job.actualRevenueCents || job.estimatedRevenueCents;
        await db()
          .update(invoiceLines)
          .set({
            description: job.title,
            quantity: "1",
            unitPriceCents: price,
            amountCents: price,
          })
          .where(eq(invoiceLines.id, lines[0].id));
        await refreshInvoice(open.id, org.id);
        const [synced] = await db()
          .select()
          .from(invoices)
          .where(eq(invoices.id, open.id));
        return { invoice: synced, created: false };
      }
    }
    return { invoice: open, created: false };
  }

  const issue = new Date().toISOString().slice(0, 10);
  const due = closeoutDueDate(issue, org.paymentTermsDays);
  const price = job.actualRevenueCents || job.estimatedRevenueCents;
  const calc = totalsFromLines([{ quantity: "1", unitPriceCents: price }], 0, org.defaultTaxBps);
  const number = await nextInvoiceNumber(org.id);
  const [invoice] = await db()
    .insert(invoices)
    .values({
      organizationId: org.id,
      customerId: job.customerId,
      jobId: job.id,
      number,
      status: "draft",
      issueDate: issue,
      dueDate: due,
      notes: org.defaultInvoiceNotes,
      taxBps: org.defaultTaxBps,
      publicToken: token(),
      createdAt: nowISO(),
      ...calc,
    })
    .returning();
  await db().insert(invoiceLines).values({
    organizationId: org.id,
    invoiceId: invoice.id,
    position: 0,
    description: job.title,
    quantity: "1",
    unitPriceCents: price,
    amountCents: price,
  });
  await addEvent(org.id, invoice.id, "created", `${number} created from job`);
  await logActivity(org.id, "invoice_created", `${number} created`, invoice.totalCents, `/invoices/${invoice.id}`);
  return { invoice, created: true };
}

export async function invoiceFromJobAction(form: FormData) {
  const { org } = await requireWritableContext("/jobs");
  const jobId = Number(str(form, "job_id"));
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, org.id)));
  if (!job) redirect("/jobs");
  const result = await invoiceForJob(org, job);
  redirect(`/invoices/${result.invoice.id}`);
}

export async function finishJobAction(form: FormData) {
  const { org } = await requireWritableContext("/jobs");
  const jobId = Number(str(form, "job_id"));
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, org.id)));
  if (!job) redirect("/jobs");
  const next = str(form, "next") || "collect";

  if (next === "nocharge") {
    const draft = parseNoCharge({
      workCompleted: str(form, "work_completed"),
      reason: str(form, "no_charge_reason"),
    });
    if (!draft.ok) {
      redirect(`/jobs/${job.id}/finish?error=${encodeURIComponent(draft.error)}`);
    }
    const completedAt = job.completedAt || nowISO();
    await db()
      .update(jobs)
      .set({
        description: draft.workCompleted,
        actualRevenueCents: 0,
        status: "completed",
        completedAt,
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, org.id)));
    await db().insert(notes).values({
      organizationId: org.id,
      customerId: job.customerId,
      jobId: job.id,
      body: `No charge. ${draft.reason}`,
      createdAt: nowISO(),
    });
    if (job.status !== "completed") {
      await logActivity(org.id, "job_completed", `Job completed: ${job.title}`, 0, `/jobs/${job.id}`);
    }
    redirect(`/jobs/${job.id}?notice=${encodeURIComponent("Job finished. No charge.")}`);
  }

  const draft = parseCloseout({
    workCompleted: str(form, "work_completed"),
    finalAmount: str(form, "final_amount"),
    fallbackAmountCents: job.actualRevenueCents || job.estimatedRevenueCents,
    extraCost: str(form, "extra_cost"),
    costDescription: str(form, "cost_description"),
    costCategory: str(form, "cost_category"),
  });
  if (!draft.ok) {
    redirect(`/jobs/${job.id}/finish?error=${encodeURIComponent(draft.error)}`);
  }

  const completedAt = job.completedAt || nowISO();
  await db()
    .update(jobs)
    .set({
      description: draft.workCompleted,
      actualRevenueCents: draft.finalAmountCents,
      status: "completed",
      completedAt,
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, org.id)));

  if (draft.extraCostCents > 0 && job.status !== "completed") {
    await db().insert(jobCosts).values({
      organizationId: org.id,
      jobId: job.id,
      category: draft.costCategory,
      description: draft.costDescription,
      amountCents: draft.extraCostCents,
      createdAt: nowISO(),
    });
  }
  if (job.status !== "completed") {
    await logActivity(
      org.id,
      "job_completed",
      `Job completed: ${job.title}`,
      draft.finalAmountCents,
      `/jobs/${job.id}`,
    );
  }

  const [fresh] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, org.id)));
  const result = await invoiceForJob(org, fresh, true);

  if (next === "draft" || next === "job") {
    redirect(
      `/collect?ok=${encodeURIComponent("Job finished. Draft invoice is on Collect.")}`,
    );
  }

  if (next === "collect") {
    const notice = await deliverInvoice(org, result.invoice.id);
    redirect(
      `/jobs/${job.id}/finish?ok=${encodeURIComponent(notice)}&invoice=${result.invoice.id}`,
    );
  }

  const notice = result.created
    ? "Job finished. Review the invoice, then send it."
    : "Job finished. This invoice was already linked to it.";
  redirect(`/invoices/${result.invoice.id}?notice=${encodeURIComponent(notice)}`);
}

export async function saveInvoiceAction(form: FormData) {
  const { org } = await requireWritableContext("/invoices");
  const id = Number(str(form, "id") || 0);
  const customerId = Number(str(form, "customer_id"));
  if (!customerId) redirect("/invoices/new?error=Choose+a+customer.");
  const descriptions = form.getAll("line_description").map(String);
  const quantities = form.getAll("line_quantity").map(String);
  const prices = form.getAll("line_price").map(String);
  const lines = descriptions
    .map((description, i) => ({
      description: description.trim(),
      quantity: quantities[i] || "1",
      unitPriceCents: dollarsToCents(prices[i]),
    }))
    .filter((l) => l.description);
  if (!lines.length) redirect("/invoices/new?error=Add+at+least+one+line+item.");
  const calc = totalsFromLines(lines, dollarsToCents(str(form, "discount")), Math.round(Number(str(form, "tax_rate") || 0) * 100));
  const payload = {
    customerId,
    jobId: Number(str(form, "job_id") || 0) || null,
    issueDate: str(form, "issue_date") || new Date().toISOString().slice(0, 10),
    dueDate: str(form, "due_date") || new Date().toISOString().slice(0, 10),
    notes: str(form, "notes"),
    taxBps: Math.round(Number(str(form, "tax_rate") || 0) * 100),
    ...calc,
  };
  if (id) {
    const [invoice] = await db().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.organizationId, org.id)));
    if (!invoice || invoice.status === "paid" || invoice.status === "void") redirect(`/invoices/${id}`);
    await db().update(invoices).set(payload).where(eq(invoices.id, id));
    await db().delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    for (const [i, line] of lines.entries()) {
      await db().insert(invoiceLines).values({
        organizationId: org.id,
        invoiceId: id,
        position: i,
        ...line,
        amountCents: Math.round(Number(line.quantity || 1) * line.unitPriceCents),
      });
    }
    await refreshInvoice(id, org.id);
    const sync = await pushInvoiceToStripe(org.id, id);
    if (sync.error) {
      redirect(`/invoices/${id}?notice=${encodeURIComponent(`Saved. Stripe: ${sync.error}`)}`);
    }
    redirect(`/invoices/${id}`);
  }
  const number = await nextInvoiceNumber(org.id);
  const [invoice] = await db()
    .insert(invoices)
    .values({
      organizationId: org.id,
      number,
      status: "draft",
      publicToken: token(),
      createdAt: nowISO(),
      ...payload,
    })
    .returning();
  for (const [i, line] of lines.entries()) {
    await db().insert(invoiceLines).values({
      organizationId: org.id,
      invoiceId: invoice.id,
      position: i,
      ...line,
      amountCents: Math.round(Number(line.quantity || 1) * line.unitPriceCents),
    });
  }
  await addEvent(org.id, invoice.id, "created", `${number} created`);
  await refreshInvoice(invoice.id, org.id);
  const sync = await pushInvoiceToStripe(org.id, invoice.id);
  if (sync.error) {
    redirect(`/invoices/${invoice.id}?notice=${encodeURIComponent(`Saved. Stripe: ${sync.error}`)}`);
  }
  redirect(`/invoices/${invoice.id}`);
}

async function deliverInvoice(
  org: typeof organizations.$inferSelect,
  invoiceId: number,
): Promise<string> {
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org.id)));
  if (!invoice) return "Invoice not found.";
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  await db()
    .update(invoices)
    .set({
      sentAt: invoice.sentAt || nowISO(),
      status: invoice.status === "draft" ? "sent" : invoice.status,
    })
    .where(eq(invoices.id, invoiceId));
  await addEvent(org.id, invoiceId, "sent", "Marked as sent");
  await refreshInvoice(invoiceId, org.id);

  const config = await emailConfig(org.id);
  let notice = "Marked as sent. Share the customer link below.";
  const sync = await pushInvoiceToStripe(org.id, invoiceId, { finalize: true, send: true });
  if (sync.ok && sync.sent) {
    notice = customer?.email
      ? `Invoice sent through Stripe to ${customer.email}.`
      : "Invoice sent through Stripe.";
    if (sync.hostedUrl) notice = `${notice} Also on the Stripe hosted invoice.`;
    return notice;
  }
  if (!customer?.email) {
    notice = "Marked as sent. This customer has no email address on file.";
  } else if (!config) {
    notice = "Marked as sent. Connect email under Settings to deliver it automatically.";
  } else {
    const paid = await amountPaidCents(invoiceId);
    const base = await absoluteBaseUrl();
    const body = invoiceEmail({
      shopName: org.name,
      invoiceNumber: invoice.number,
      amountDue: formatMoney(balanceCents(invoice.totalCents, paid, invoice.status)),
      dueDate: prettyDate(invoice.dueDate),
      payUrl: invoicePayUrl(base, invoice.publicToken),
      notes: invoice.notes,
    });
    try {
      await sendEmail(config, { to: customer.email, ...body });
      await addEvent(org.id, invoiceId, "emailed", `Emailed to ${customer.email}`);
      notice = `Invoice emailed to ${customer.email}.`;
    } catch (error) {
      notice = `Marked as sent, but the email did not go out. ${(error as Error).message}`;
    }
  }
  if (sync.ok && sync.hostedUrl) {
    notice = `${notice} Also in Stripe.`;
  } else if (sync.error) {
    notice = `${notice} Stripe did not take the invoice: ${sync.error}`;
  }
  return notice;
}

export async function sendInvoiceAction(form: FormData) {
  const { org } = await requireWritableContext("/invoices");
  const id = Number(str(form, "id"));
  const [invoice] = await db()
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, org.id)));
  if (!invoice) redirect("/invoices");
  const notice = await deliverInvoice(org, id);
  redirect(`/invoices/${id}?notice=${encodeURIComponent(notice)}`);
}

export async function sendCollectInvoiceAction(form: FormData) {
  const { org } = await requireWritableContext("/collect");
  const id = Number(str(form, "id"));
  const [invoice] = await db()
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, org.id)));
  if (!invoice) redirect("/collect");
  const notice = await deliverInvoice(org, id);
  redirect(`/collect?ok=${encodeURIComponent(notice)}&invoice=${id}`);
}

export async function billFinishedJobAction(form: FormData) {
  const { org } = await requireWritableContext("/collect");
  const jobId = Number(str(form, "job_id"));
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, org.id)));
  if (!job) redirect("/collect");
  if (job.status !== "completed") {
    redirect(`/jobs/${job.id}/finish`);
  }
  const result = await invoiceForJob(org, job, true);
  const notice = await deliverInvoice(org, result.invoice.id);
  redirect(`/collect?ok=${encodeURIComponent(notice)}&invoice=${result.invoice.id}`);
}

export async function voidInvoiceAction(form: FormData) {
  const { org } = await requireWritableContext("/invoices");
  const id = Number(str(form, "id"));
  const paid = await db().select().from(payments).where(and(eq(payments.invoiceId, id), isNull(payments.voidedAt)));
  if (paid.length) redirect(`/invoices/${id}?error=Void+the+payments+first.`);
  await db().update(invoices).set({ status: "void", voidedAt: nowISO() }).where(and(eq(invoices.id, id), eq(invoices.organizationId, org.id)));
  await addEvent(org.id, id, "voided", "Invoice voided");
  await voidStripeIfLinked(org.id, id);
  redirect(`/invoices/${id}`);
}

export async function saveEstimateAction(form: FormData) {
  const { org } = await requireWritableContext("/estimates");
  const id = Number(str(form, "id") || 0);
  const back = id ? `/estimates/${id}/edit` : "/estimates/new";
  const customerId = Number(str(form, "customer_id"));
  const [customer] = customerId
    ? await db()
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.organizationId, org.id)))
    : [];
  if (!customer) redirect(`${back}?error=${encodeURIComponent("Choose a customer.")}`);

  const descriptions = form.getAll("line_description").map(String);
  const quantities = form.getAll("line_quantity").map(String);
  const prices = form.getAll("line_price").map(String);
  const lines = descriptions
    .map((description, i) => ({
      description: description.trim(),
      quantity: quantities[i] || "1",
      unitPriceCents: dollarsToCents(prices[i]),
    }))
    .filter((line) => line.description);
  if (!lines.length) redirect(`${back}?error=${encodeURIComponent("Add at least one line item.")}`);
  const taxRate = Number(str(form, "tax_rate") || 0);
  if (!Number.isFinite(taxRate) || taxRate < 0) {
    redirect(`${back}?error=${encodeURIComponent("Enter a valid tax rate.")}`);
  }
  const issueDate = str(form, "issue_date") || new Date().toISOString().slice(0, 10);
  const validUntil = str(form, "valid_until") || issueDate;
  if (validUntil < issueDate) {
    redirect(`${back}?error=${encodeURIComponent("Valid until cannot be before the issue date.")}`);
  }
  const taxBps = Math.round(taxRate * 100);
  const calc = estimateTotals(lines, dollarsToCents(str(form, "discount")), taxBps);
  const now = nowISO();
  const payload = {
    customerId,
    issueDate,
    validUntil,
    notes: str(form, "notes"),
    taxBps,
    ...calc,
    updatedAt: now,
  };

  let estimateId = id;
  if (id) {
    const [estimate] = await db()
      .select()
      .from(estimates)
      .where(and(eq(estimates.id, id), eq(estimates.organizationId, org.id)));
    if (!estimate || !canEditEstimate(estimate.status)) redirect(`/estimates/${id}`);
    await db()
      .update(estimates)
      .set({
        ...payload,
        status: "draft",
        sentAt: null,
        viewedAt: null,
      })
      .where(and(eq(estimates.id, id), eq(estimates.organizationId, org.id)));
    await db()
      .delete(estimateLines)
      .where(and(eq(estimateLines.estimateId, id), eq(estimateLines.organizationId, org.id)));
    await addEstimateEvent(org.id, id, "edited", "Estimate updated and returned to draft");
  } else {
    const number = await nextEstimateNumber(org.id);
    const [estimate] = await db()
      .insert(estimates)
      .values({
        organizationId: org.id,
        number,
        status: "draft",
        publicToken: token(),
        createdAt: now,
        ...payload,
      })
      .returning({ id: estimates.id });
    estimateId = estimate.id;
    await addEstimateEvent(org.id, estimateId, "created", `${number} created`);
  }
  for (const [position, line] of lines.entries()) {
    await db().insert(estimateLines).values({
      organizationId: org.id,
      estimateId,
      position,
      ...line,
      amountCents: Math.round(Number(line.quantity || 1) * line.unitPriceCents),
    });
  }
  redirect(`/estimates/${estimateId}`);
}

export async function sendEstimateAction(form: FormData) {
  const { org } = await requireWritableContext("/estimates");
  const id = Number(str(form, "id"));
  const [estimate] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, id), eq(estimates.organizationId, org.id)));
  if (!estimate) redirect("/estimates");
  if (!canEditEstimate(estimate.status)) {
    redirect(`/estimates/${id}?error=${encodeURIComponent("This estimate can no longer be sent.")}`);
  }
  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, estimate.customerId), eq(customers.organizationId, org.id)));
  const sentAt = estimate.sentAt || nowISO();
  await db()
    .update(estimates)
    .set({
      sentAt,
      status: estimate.status === "viewed" ? "viewed" : "sent",
      updatedAt: nowISO(),
    })
    .where(and(eq(estimates.id, id), eq(estimates.organizationId, org.id)));
  await addEstimateEvent(org.id, id, "sent", "Marked as sent");

  const config = await emailConfig(org.id);
  let notice = "Marked as sent. Share the customer link below.";
  if (!customer?.email) {
    notice = "Marked as sent. This customer has no email address on file.";
  } else if (!config) {
    notice = "Marked as sent. Connect email under Settings to deliver it automatically.";
  } else {
    const base = await absoluteBaseUrl();
    const body = estimateEmail({
      shopName: org.name,
      estimateNumber: estimate.number,
      total: formatMoney(estimate.totalCents),
      validUntil: prettyDate(estimate.validUntil),
      reviewUrl: `${base}/p/est/${estimate.publicToken}`,
      notes: estimate.notes,
    });
    try {
      await sendEmail(config, { to: customer.email, ...body });
      await addEstimateEvent(org.id, id, "emailed", `Emailed to ${customer.email}`);
      notice = `Estimate emailed to ${customer.email}.`;
    } catch (error) {
      notice = `Marked as sent, but the email did not go out. ${(error as Error).message}`;
    }
  }
  redirect(`/estimates/${id}?notice=${encodeURIComponent(notice)}`);
}

export async function voidEstimateAction(form: FormData) {
  const { org } = await requireWritableContext("/estimates");
  const id = Number(str(form, "id"));
  const [estimate] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, id), eq(estimates.organizationId, org.id)));
  if (!estimate) redirect("/estimates");
  if (estimate.status === "converted" || estimate.status === "void") redirect(`/estimates/${id}`);
  const now = nowISO();
  await db()
    .update(estimates)
    .set({ status: "void", voidedAt: now, updatedAt: now })
    .where(and(eq(estimates.id, id), eq(estimates.organizationId, org.id)));
  await addEstimateEvent(org.id, id, "voided", "Estimate voided");
  redirect(`/estimates/${id}`);
}

export async function convertEstimateToJobAction(form: FormData) {
  const { org } = await requireWritableContext("/estimates");
  const id = Number(str(form, "id"));
  let result: { jobId: number; created: boolean };
  try {
    result = await convertApprovedEstimate(org.id, id);
  } catch (error) {
    redirect(`/estimates/${id}?error=${encodeURIComponent((error as Error).message)}`);
  }
  redirect(`/jobs/${result.jobId}?notice=${encodeURIComponent(result.created ? "Job created from approved estimate." : "This estimate was already converted.")}`);
}

export async function recordPaymentAction(form: FormData) {
  const { org } = await requireWritableContext("/payments");
  try {
    const id = await applyPayment({
      organizationId: org.id,
      customerId: Number(str(form, "customer_id") || 0),
      invoiceId: Number(str(form, "invoice_id") || 0) || null,
      amountCents: dollarsToCents(str(form, "amount")),
      paidOn: str(form, "paid_on") || new Date().toISOString().slice(0, 10),
      method: str(form, "method") || "card",
      reference: str(form, "reference"),
      notes: str(form, "notes"),
    });
    const invoiceId = Number(str(form, "invoice_id") || 0);
    if (invoiceId) await markStripePaidIfLinked(org.id, invoiceId);
    redirect(invoiceId ? `/invoices/${invoiceId}` : `/payments/${id}`);
  } catch (error) {
    redirect(`/payments/new?error=${encodeURIComponent((error as Error).message)}`);
  }
}

export async function voidPaymentAction(form: FormData) {
  const { org } = await requireWritableContext("/payments");
  const id = Number(str(form, "id"));
  const [payment] = await db().select().from(payments).where(and(eq(payments.id, id), eq(payments.organizationId, org.id)));
  if (payment && !payment.voidedAt) {
    await db().update(payments).set({ voidedAt: nowISO() }).where(eq(payments.id, id));
    if (payment.invoiceId) await refreshInvoice(payment.invoiceId, org.id);
  }
  redirect("/payments");
}

export async function saveSettingsAction(form: FormData) {
  const { org, user } = await requireContext();
  const section = str(form, "section");
  if (section === "company") {
    await db()
      .update(organizations)
      .set({
        name: str(form, "name") || org.name,
        phone: str(form, "phone"),
        email: str(form, "email"),
        addressLine1: str(form, "address_line1"),
        city: str(form, "city"),
        state: str(form, "state"),
        postalCode: str(form, "postal_code"),
        taxId: str(form, "tax_id"),
        businessType: parseBusinessType(str(form, "business_type") || org.businessType),
      })
      .where(eq(organizations.id, org.id));
  }
  if (section === "invoices") {
    await db()
      .update(organizations)
      .set({
        invoicePrefix: str(form, "invoice_prefix") || "INV-",
        paymentTermsDays: Number(str(form, "payment_terms_days") || 14),
        defaultInvoiceNotes: str(form, "default_invoice_notes"),
        defaultTaxBps: Math.round(Number(str(form, "default_tax") || 0) * 100),
      })
      .where(eq(organizations.id, org.id));
  }
  if (section === "service" && str(form, "service_name")) {
    await db().insert(serviceItems).values({
      organizationId: org.id,
      name: str(form, "service_name"),
      description: str(form, "service_description"),
      unitPriceCents: dollarsToCents(str(form, "service_price")),
    });
  }
  if (section === "account") {
    await db().update(users).set({ name: str(form, "user_name") || user.name }).where(eq(users.id, user.id));
    const next = str(form, "new_password");
    if (next) {
      if (!(await verifyPassword(user.passwordHash, str(form, "current_password")))) {
        redirect("/settings?tab=account&error=Current+password+is+incorrect.");
      }
      await db().update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
    }
  }
  redirect(`/settings?tab=${section === "service" ? "invoices" : section}`);
}

const INTEGRATIONS_TAB = "/settings?tab=integrations";

const CONNECT_RETURNS = new Set(["/overview", "/reports", "/payments", INTEGRATIONS_TAB]);

function connectReturn(form: FormData, kind: "ok" | "error" = "ok"): string {
  const next = (kind === "error" && str(form, "error_next")) || str(form, "next");
  if (CONNECT_RETURNS.has(next) || isSafeAppPath(next)) return next;
  return INTEGRATIONS_TAB;
}

function connectRedirect(form: FormData, kind: "ok" | "error", message: string): never {
  const base = connectReturn(form, kind);
  const join = base.includes("?") ? "&" : "?";
  redirect(`${base}${join}${kind}=${encodeURIComponent(message)}`);
}

function demoBlocked(): string {
  return `${INTEGRATIONS_TAB}&error=${encodeURIComponent(
    "Create your own shop to connect accounts. The demo is shared, so keys cannot be saved here.",
  )}`;
}

export async function startStripeConnectAction() {
  const { org, user } = await requireContext();
  if (user.email === DEMO_EMAIL) redirect(demoBlocked());
  if (!stripeConnectEnabled()) {
    redirect(
      `${INTEGRATIONS_TAB}&error=${encodeURIComponent(
        "One-click Connect is not enabled on this deployment. Create a restricted key in Stripe and paste it below.",
      )}`,
    );
  }
  const base = await absoluteBaseUrl();
  if (!base) {
    redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent("Could not determine this site's public address.")}`);
  }
  const state = signConnectState(org.id, user.id);
  redirect(stripeConnectAuthorizeUrl({ state, redirectUri: `${base}/api/integrations/stripe/callback` }));
}

export async function connectStripeAction(form: FormData) {
  const { org, user } = await requireContext();
  if (user.email === DEMO_EMAIL) redirect(demoBlocked());
  const secretKey = str(form, "stripe_secret_key");
  const publishableKey = str(form, "stripe_publishable_key");
  const webhookSecret = str(form, "stripe_webhook_secret");
  if (!secretKey) {
    connectRedirect(form, "error", "Paste your Stripe restricted key first (rk_live_ or rk_test_).");
  }
  const keyCheck = await validateStripeKeyForSere(secretKey);
  if (!keyCheck.ok) {
    connectRedirect(form, "error", stripeKeyDeniedMessage(keyCheck.problems));
  }
  const label = keyCheck.label;

  await saveIntegration(org.id, "stripe", {
    secretKey,
    publishableKey,
    webhookSecret,
    connectedVia: "keys",
  }, label);
  const env = stripeKeyEnv(secretKey) || "test";
  await promoteShopAfterProcessor(org.id, org.operatingMode, env);
  let message = `Stripe connected to ${label}.`;
  try {
    const pulled = await syncStripeBook(org.id, { limit: 40 });
    if (pulled.ok) message = `${message} ${describeBookSync("Stripe", pulled)}`;
  } catch {
    // Connection is enough. The shop can tap Sync from Stripe.
  }
  connectRedirect(form, "ok", message);
}

export async function disconnectStripeAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "stripe");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("Stripe disconnected. Payments can still be logged by hand.")}`);
}

function on(form: FormData, key: string): boolean {
  const value = str(form, key).toLowerCase();
  return value === "1" || value === "on" || value === "true";
}

export async function connectSquareAction(form: FormData) {
  const { org, user } = await requireContext();
  if (user.email === DEMO_EMAIL) redirect(demoBlocked());
  const accessToken = str(form, "square_access_token");
  let locationId = str(form, "square_location_id");
  const webhookSignatureKey = str(form, "square_webhook_key");
  const sandboxChosen = str(form, "square_sandbox") !== "";
  const sandboxOnly = on(form, "square_sandbox");
  if (!accessToken) {
    connectRedirect(form, "error", "Paste your Square access token first.");
  }
  let failure = "";
  let label = "";
  let sandbox = sandboxOnly;
  const tries = sandboxChosen ? [sandboxOnly] : [false, true];
  for (const env of tries) {
    try {
      const locations = await listSquareLocations(accessToken, env);
      if (!locationId) locationId = locations[0]?.id || "";
      if (!locationId) throw new Error("This Square account has no active location.");
      label = await squareAccountLabel(accessToken, env);
      sandbox = env;
      failure = "";
      break;
    } catch (error) {
      failure = (error as Error).message;
    }
  }
  if (failure) connectRedirect(form, "error", failure);
  await saveIntegration(
    org.id,
    "square",
    { accessToken, locationId, webhookSignatureKey, sandbox },
    label,
  );
  await promoteShopAfterProcessor(org.id, org.operatingMode, sandbox ? "test" : "live");
  let message = `Square connected to ${label}.`;
  try {
    const pulled = await syncSquareBook(org.id, { limit: 40 });
    if (pulled.ok) message = `${message} ${describeBookSync("Square", pulled)}`;
  } catch {
    // Connection is enough. The shop can tap Sync from Square.
  }
  connectRedirect(form, "ok", message);
}

export async function disconnectSquareAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "square");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("Square disconnected.")}`);
}

export async function connectOpenAIAction(_form: FormData) {
  redirect(
    `${INTEGRATIONS_TAB}&ok=${encodeURIComponent(
      "Shops do not paste an OpenAI key. Serenity uses Sere's key, with a $3 credit each month.",
    )}`,
  );
}

export async function disconnectOpenAIAction() {
  redirect(
    `${INTEGRATIONS_TAB}&ok=${encodeURIComponent(
      "Serenity stays on Sere's key. There is nothing to disconnect.",
    )}`,
  );
}

export async function connectPaypalAction(form: FormData) {
  const { org, user } = await requireContext();
  if (user.email === DEMO_EMAIL) redirect(demoBlocked());
  const clientId = str(form, "paypal_client_id");
  const clientSecret = str(form, "paypal_client_secret");
  const webhookId = str(form, "paypal_webhook_id");
  const sandbox = on(form, "paypal_sandbox");
  if (!clientId || !clientSecret) {
    redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent("PayPal client id and secret are both required.")}`);
  }
  let failure = "";
  let label = "";
  try {
    label = await paypalAccountLabel(clientId, clientSecret, sandbox);
  } catch (error) {
    failure = (error as Error).message;
  }
  if (failure) redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent(failure)}`);
  await saveIntegration(
    org.id,
    "paypal",
    { clientId, clientSecret, webhookId, sandbox },
    label,
  );
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent(`PayPal connected (${label}).`)}`);
}

export async function disconnectPaypalAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "paypal");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("PayPal disconnected.")}`);
}

export async function connectQuickbooksAction(form: FormData) {
  const { org, user } = await requireContext();
  if (user.email === DEMO_EMAIL) redirect(demoBlocked());
  const accessToken = str(form, "quickbooks_access_token");
  const realmId = str(form, "quickbooks_realm_id");
  const sandbox = on(form, "quickbooks_sandbox");
  if (!accessToken || !realmId) {
    redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent("A QuickBooks access token and company id are both required.")}`);
  }
  let failure = "";
  let label = "";
  try {
    label = await quickBooksCompanyName(accessToken, realmId, sandbox);
  } catch (error) {
    failure = (error as Error).message;
  }
  if (failure) redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent(failure)}`);
  await saveIntegration(org.id, "quickbooks", { accessToken, realmId, sandbox }, label);
  let message = `QuickBooks connected to ${label}.`;
  try {
    const pulled = await syncQuickbooksBook(org.id, { limit: 40 });
    if (pulled.ok) message = `${message} ${describeBookSync("QuickBooks", pulled)}`;
  } catch {
    // Connection is enough. The shop can tap Sync from QuickBooks.
  }
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent(message)}`);
}

export async function disconnectQuickbooksAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "quickbooks");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("QuickBooks disconnected.")}`);
}

export async function syncStripeBookAction() {
  const { org } = await requireWritableContext(INTEGRATIONS_TAB);
  const result = await syncStripeBook(org.id);
  const key = result.ok ? "ok" : "error";
  redirect(`${INTEGRATIONS_TAB}&${key}=${encodeURIComponent(describeBookSync("Stripe", result))}`);
}

export async function syncSquareBookAction() {
  const { org } = await requireWritableContext(INTEGRATIONS_TAB);
  const result = await syncSquareBook(org.id);
  const key = result.ok ? "ok" : "error";
  redirect(`${INTEGRATIONS_TAB}&${key}=${encodeURIComponent(describeBookSync("Square", result))}`);
}

export async function syncQuickbooksBookAction() {
  const { org } = await requireWritableContext(INTEGRATIONS_TAB);
  const result = await syncQuickbooksBook(org.id);
  const key = result.ok ? "ok" : "error";
  redirect(`${INTEGRATIONS_TAB}&${key}=${encodeURIComponent(describeBookSync("QuickBooks", result))}`);
}

export async function connectEmailAction(form: FormData) {
  const { org } = await requireContext();
  const apiKey = str(form, "email_api_key");
  const fromEmail = str(form, "email_from").toLowerCase();
  const fromName = str(form, "email_from_name") || org.name;
  const replyTo = str(form, "email_reply_to");
  if (!apiKey || !fromEmail) {
    redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent("An API key and a from address are both required.")}`);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) {
    redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent("That from address is not a valid email address.")}`);
  }
  await saveIntegration(
    org.id,
    "email",
    { provider: "resend", apiKey, fromEmail, fromName, replyTo },
    fromEmail,
  );
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("Email connected. Send yourself a test to confirm.")}`);
}

export async function disconnectEmailAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "email");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("Email disconnected. Invoices will only be marked as sent.")}`);
}

export async function sendTestEmailAction() {
  const { org, user } = await requireContext();
  const config = await emailConfig(org.id);
  if (!config) {
    redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent("Connect email first.")}`);
  }
  let failure = "";
  try {
    await sendEmail(config, {
      to: user.email,
      subject: `${org.name}: Sere email is working`,
      text: `This is a test from Sere. Invoices sent from ${org.name} will arrive from ${config.fromEmail}.`,
    });
  } catch (error) {
    failure = (error as Error).message;
  }
  if (failure) redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent(failure)}`);
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent(`Test email sent to ${user.email}.`)}`);
}

export async function markNotificationsReadAction() {
  const { org } = await requireContext();
  await db().update(notifications).set({ readAt: nowISO() }).where(eq(notifications.organizationId, org.id));
  redirect("/notifications");
}

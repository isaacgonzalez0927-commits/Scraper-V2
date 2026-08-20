"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boot } from "@/lib/boot";
import { clearSession, createSession, hashPassword, requireContext, verifyPassword } from "@/lib/auth";
import { db, nowISO, token } from "@/lib/db";
import { invoiceEmail, sendEmail } from "@/lib/email";
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
import { closeoutDueDate, parseCloseout } from "@/lib/closeout";
import { dollarsToCents, formatMoney } from "@/lib/money";
import { prettyDate } from "@/lib/labels";
import { looksLikeOpenAIKey, validateOpenAIKey, DEFAULT_OPENAI_MODEL } from "@/lib/openai";
import { paypalAccountLabel } from "@/lib/paypal";
import { quickBooksCompanyName } from "@/lib/quickbooks";
import { listSquareLocations, squareAccountLabel } from "@/lib/square";
import { accountLabel, looksLikeStripeSecret, retrieveAccount, signConnectState, stripeConnectAuthorizeUrl, stripeConnectEnabled } from "@/lib/stripe";
import { DEMO_EMAIL } from "@/lib/seed";
import { absoluteBaseUrl } from "@/lib/url";
import {
  customers,
  invoiceLines,
  invoices,
  jobCosts,
  jobs,
  memberships,
  notes,
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

async function maybeSaveStripe(organizationId: number, secretKey: string): Promise<void> {
  if (!looksLikeStripeSecret(secretKey)) return;
  try {
    const label = accountLabel(await retrieveAccount(secretKey));
    await saveIntegration(
      organizationId,
      "stripe",
      { secretKey, publishableKey: "", webhookSecret: "", connectedVia: "keys" },
      label,
    );
  } catch {
    // Shop is created either way. They can paste a working key in Settings.
  }
}

async function maybeSaveSquare(organizationId: number, accessToken: string): Promise<void> {
  if (!accessToken) return;
  for (const sandbox of [false, true]) {
    try {
      const locations = await listSquareLocations(accessToken, sandbox);
      const locationId = locations[0]?.id || "";
      if (!locationId) continue;
      const label = await squareAccountLabel(accessToken, sandbox);
      await saveIntegration(
        organizationId,
        "square",
        { accessToken, locationId, webhookSignatureKey: "", sandbox },
        label,
      );
      return;
    } catch {
      // Try the other environment, then give up.
    }
  }
}

async function maybeSaveOpenAI(organizationId: number, apiKey: string): Promise<void> {
  if (!looksLikeOpenAIKey(apiKey)) return;
  try {
    const label = await validateOpenAIKey(apiKey);
    await saveIntegration(
      organizationId,
      "openai",
      { apiKey, model: DEFAULT_OPENAI_MODEL },
      label,
    );
  } catch {
    // Shop is created either way. They can paste a working key in Settings.
  }
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
  redirect("/overview");
}

export async function signupAction(form: FormData) {
  await boot();
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const company = str(form, "company");
  const businessType = parseBusinessType(str(form, "business_type"));
  if (!name || !email || !password || !company) {
    redirect("/signup?error=Shop+name,+your+name,+email,+and+password+are+required.");
  }
  if (password.length < 8) redirect("/signup?error=Use+at+least+8+characters.");
  const existing = await db().select().from(users).where(eq(users.email, email));
  if (existing.length) redirect("/signup?error=An+account+with+that+email+already+exists.");
  const created = nowISO();
  const voice = tradeCopy(businessType);
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
      businessType,
      defaultInvoiceNotes: voice.defaultNotes,
      createdAt: created,
    })
    .returning();
  await db().insert(memberships).values({ userId: user.id, organizationId: org.id, role: "owner", createdAt: created });
  for (const [n, d, p] of voice.services) {
    await db().insert(serviceItems).values({ organizationId: org.id, name: n, description: d, unitPriceCents: p });
  }
  await maybeSaveStripe(org.id, str(form, "stripe_secret_key"));
  await maybeSaveSquare(org.id, str(form, "square_access_token"));
  await maybeSaveOpenAI(org.id, str(form, "openai_api_key"));
  await createSession(user.id, org.id);
  redirect("/overview");
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
  const { org } = await requireContext();
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
    customerSince: str(form, "customer_since") || new Date().toISOString().slice(0, 10),
  };
  if (!row.name) redirect("/customers/new?error=A+customer+name+is+required.");
  if (id) {
    await db().update(customers).set(row).where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
    redirect(`/customers/${id}`);
  }
  const [created] = await db()
    .insert(customers)
    .values({ ...row, organizationId: org.id, createdAt: nowISO() })
    .returning();
  await logActivity(org.id, "customer_created", `New customer: ${created.name}`, null, `/customers/${created.id}`);
  if (str(form, "next") === "job") redirect(`/jobs/new?customerId=${created.id}`);
  redirect(`/customers/${created.id}`);
}

export async function archiveCustomerAction(form: FormData) {
  const { org } = await requireContext();
  const id = Number(str(form, "id"));
  const [c] = await db().select().from(customers).where(and(eq(customers.id, id), eq(customers.organizationId, org.id)));
  if (!c) redirect("/customers");
  await db()
    .update(customers)
    .set({ archivedAt: c.archivedAt ? null : nowISO() })
    .where(eq(customers.id, id));
  redirect(`/customers/${id}`);
}

export async function addNoteAction(form: FormData) {
  const { org } = await requireContext();
  const body = str(form, "body");
  const customerId = Number(str(form, "customer_id") || 0) || null;
  const jobId = Number(str(form, "job_id") || 0) || null;
  if (body) {
    await db().insert(notes).values({ organizationId: org.id, customerId, jobId, body, createdAt: nowISO() });
  }
  redirect(jobId ? `/jobs/${jobId}` : `/customers/${customerId}`);
}

export async function saveJobAction(form: FormData) {
  const { org } = await requireContext();
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
  const row = {
    customerId: Number(str(form, "customer_id")),
    title: str(form, "title"),
    description: str(form, "description"),
    serviceLine1: str(form, "service_line1"),
    serviceCity: str(form, "service_city"),
    serviceState: str(form, "service_state"),
    servicePostal: str(form, "service_postal"),
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
  if (!row.customerId || !row.title) redirect("/jobs/new?error=Customer+and+title+are+required.");
  if (id) {
    await db().update(jobs).set(row).where(and(eq(jobs.id, id), eq(jobs.organizationId, org.id)));
    redirect(`/jobs/${id}`);
  }
  const [job] = await db().insert(jobs).values({ ...row, organizationId: org.id, createdAt: nowISO() }).returning();
  await logActivity(org.id, "job_created", `New job: ${job.title}`, job.estimatedRevenueCents, `/jobs/${job.id}`);
  redirect(`/jobs/${job.id}`);
}

export async function updateJobStatusAction(form: FormData) {
  const { org } = await requireContext();
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
  const { org } = await requireContext();
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
  const { org } = await requireContext();
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
  const { org } = await requireContext();
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
  const { org } = await requireContext();
  const jobId = Number(str(form, "job_id"));
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, org.id)));
  if (!job) redirect("/jobs");

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

  if (str(form, "next") !== "invoice") {
    redirect(`/jobs/${job.id}?notice=${encodeURIComponent("Job finished and final amount saved.")}`);
  }

  const [fresh] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, org.id)));
  const result = await invoiceForJob(org, fresh, true);
  const notice = result.created
    ? "Job finished. Review the invoice, then send it."
    : "Job finished. This invoice was already linked to it.";
  redirect(`/invoices/${result.invoice.id}?notice=${encodeURIComponent(notice)}`);
}

export async function saveInvoiceAction(form: FormData) {
  const { org } = await requireContext();
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
  redirect(`/invoices/${invoice.id}`);
}

export async function sendInvoiceAction(form: FormData) {
  const { org } = await requireContext();
  const id = Number(str(form, "id"));
  const [invoice] = await db().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.organizationId, org.id)));
  if (!invoice) redirect("/invoices");
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  await db()
    .update(invoices)
    .set({ sentAt: invoice.sentAt || nowISO(), status: invoice.status === "draft" ? "sent" : invoice.status })
    .where(eq(invoices.id, id));
  await addEvent(org.id, id, "sent", "Marked as sent");
  await refreshInvoice(id, org.id);

  const config = await emailConfig(org.id);
  let notice = "Marked as sent. Share the customer link below.";
  if (!customer?.email) {
    notice = "Marked as sent. This customer has no email address on file.";
  } else if (!config) {
    notice = "Marked as sent. Connect email under Settings to deliver it automatically.";
  } else {
    const paid = await amountPaidCents(id);
    const base = await absoluteBaseUrl();
    const body = invoiceEmail({
      shopName: org.name,
      invoiceNumber: invoice.number,
      amountDue: formatMoney(balanceCents(invoice.totalCents, paid, invoice.status)),
      dueDate: prettyDate(invoice.dueDate),
      payUrl: `${base}/p/inv/${invoice.publicToken}`,
      notes: invoice.notes,
    });
    try {
      await sendEmail(config, { to: customer.email, ...body });
      await addEvent(org.id, id, "emailed", `Emailed to ${customer.email}`);
      notice = `Invoice emailed to ${customer.email}.`;
    } catch (error) {
      notice = `Marked as sent, but the email did not go out. ${(error as Error).message}`;
    }
  }
  redirect(`/invoices/${id}?notice=${encodeURIComponent(notice)}`);
}

export async function voidInvoiceAction(form: FormData) {
  const { org } = await requireContext();
  const id = Number(str(form, "id"));
  const paid = await db().select().from(payments).where(and(eq(payments.invoiceId, id), isNull(payments.voidedAt)));
  if (paid.length) redirect(`/invoices/${id}?error=Void+the+payments+first.`);
  await db().update(invoices).set({ status: "void", voidedAt: nowISO() }).where(and(eq(invoices.id, id), eq(invoices.organizationId, org.id)));
  await addEvent(org.id, id, "voided", "Invoice voided");
  redirect(`/invoices/${id}`);
}

export async function recordPaymentAction(form: FormData) {
  const { org } = await requireContext();
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
    redirect(invoiceId ? `/invoices/${invoiceId}` : `/payments/${id}`);
  } catch (error) {
    redirect(`/payments/new?error=${encodeURIComponent((error as Error).message)}`);
  }
}

export async function voidPaymentAction(form: FormData) {
  const { org } = await requireContext();
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

function connectReturn(form: FormData): string {
  const next = str(form, "next");
  return CONNECT_RETURNS.has(next) ? next : INTEGRATIONS_TAB;
}

function connectRedirect(form: FormData, kind: "ok" | "error", message: string): never {
  const base = connectReturn(form);
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
        "One-click Connect is not enabled on this deployment. Paste a Stripe secret key below.",
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
    connectRedirect(form, "error", "Paste your Stripe secret key first.");
  }
  if (!looksLikeStripeSecret(secretKey)) {
    connectRedirect(
      form,
      "error",
      "That does not look like a Stripe secret key. It starts with sk_live_, sk_test_, or rk_live_.",
    );
  }

  let failure = "";
  let label = "";
  try {
    label = accountLabel(await retrieveAccount(secretKey));
  } catch (error) {
    failure = (error as Error).message;
  }
  if (failure) connectRedirect(form, "error", failure);

  await saveIntegration(org.id, "stripe", {
    secretKey,
    publishableKey,
    webhookSecret,
    connectedVia: "keys",
  }, label);
  connectRedirect(form, "ok", `Stripe connected to ${label}.`);
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
  connectRedirect(form, "ok", `Square connected to ${label}.`);
}

export async function disconnectSquareAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "square");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("Square disconnected.")}`);
}

export async function connectOpenAIAction(form: FormData) {
  const { org, user } = await requireContext();
  if (user.email === DEMO_EMAIL) redirect(demoBlocked());
  const apiKey = str(form, "openai_api_key");
  const model = str(form, "openai_model") || DEFAULT_OPENAI_MODEL;
  if (!apiKey) {
    connectRedirect(form, "error", "Paste your OpenAI API key first.");
  }
  if (!looksLikeOpenAIKey(apiKey)) {
    connectRedirect(
      form,
      "error",
      "That does not look like an OpenAI key. It starts with sk- or sk-proj-.",
    );
  }
  let failure = "";
  let label = "";
  try {
    label = await validateOpenAIKey(apiKey);
  } catch (error) {
    failure = (error as Error).message;
  }
  if (failure) connectRedirect(form, "error", failure);
  await saveIntegration(org.id, "openai", { apiKey, model }, label);
  connectRedirect(form, "ok", `OpenAI connected. The Sere assistant can use GPT now.`);
}

export async function disconnectOpenAIAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "openai");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("OpenAI disconnected. The assistant is rules-only again.")}`);
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
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent(`QuickBooks connected to ${label}.`)}`);
}

export async function disconnectQuickbooksAction() {
  const { org } = await requireContext();
  await disconnectIntegration(org.id, "quickbooks");
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent("QuickBooks disconnected.")}`);
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

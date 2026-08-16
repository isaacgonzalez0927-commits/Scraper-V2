"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boot } from "@/lib/boot";
import { clearSession, createSession, hashPassword, requireContext, verifyPassword } from "@/lib/auth";
import { db, nowISO, token } from "@/lib/db";
import {
  addEvent,
  applyPayment,
  logActivity,
  nextInvoiceNumber,
  refreshInvoice,
  totalsFromLines,
} from "@/lib/finance";
import { dollarsToCents } from "@/lib/money";
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
  if (!name || !email || !password || !company) redirect("/signup?error=All+fields+are+required.");
  if (password.length < 8) redirect("/signup?error=Use+at+least+8+characters.");
  const existing = await db().select().from(users).where(eq(users.email, email));
  if (existing.length) redirect("/signup?error=An+account+with+that+email+already+exists.");
  const created = nowISO();
  const [user] = await db()
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), createdAt: created })
    .returning();
  const [org] = await db()
    .insert(organizations)
    .values({ name: company, slug: slugify(company), email, createdAt: created })
    .returning();
  await db().insert(memberships).values({ userId: user.id, organizationId: org.id, role: "owner", createdAt: created });
  for (const [n, d, p] of [
    ["Diagnostic visit", "Inspection", 12900],
    ["AC tune-up", "Seasonal clean", 18900],
    ["Capacitor replacement", "Parts and labor", 28500],
  ] as const) {
    await db().insert(serviceItems).values({ organizationId: org.id, name: n, description: d, unitPriceCents: p });
  }
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
  await logActivity(org.id, "customer_created", `New customer — ${created.name}`, null, `/customers/${created.id}`);
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
    completedAt: status === "completed" ? nowISO() : null,
  };
  if (!row.customerId || !row.title) redirect("/jobs/new?error=Customer+and+title+are+required.");
  if (id) {
    await db().update(jobs).set(row).where(and(eq(jobs.id, id), eq(jobs.organizationId, org.id)));
    redirect(`/jobs/${id}`);
  }
  const [job] = await db().insert(jobs).values({ ...row, organizationId: org.id, createdAt: nowISO() }).returning();
  await logActivity(org.id, "job_created", `New job created — ${job.title}`, job.estimatedRevenueCents, `/jobs/${job.id}`);
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
    await logActivity(org.id, "job_completed", `Job completed — ${job.title}`, job.estimatedRevenueCents, `/jobs/${id}`);
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

export async function invoiceFromJobAction(form: FormData) {
  const { org } = await requireContext();
  const jobId = Number(str(form, "job_id"));
  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.organizationId, org.id)));
  if (!job) redirect("/jobs");
  const existing = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.jobId, jobId), eq(invoices.organizationId, org.id)));
  const open = existing.find((i) => i.status !== "void");
  if (open) redirect(`/invoices/${open.id}`);
  const issue = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + org.paymentTermsDays * 86400000).toISOString().slice(0, 10);
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
  redirect(`/invoices/${invoice.id}`);
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
  await db()
    .update(invoices)
    .set({ sentAt: invoice.sentAt || nowISO(), status: invoice.status === "draft" ? "sent" : invoice.status })
    .where(eq(invoices.id, id));
  await addEvent(org.id, id, "sent", `Sent to customer`);
  await refreshInvoice(id, org.id);
  const configured = Boolean(process.env.SERE_SMTP_HOST);
  redirect(configured ? `/invoices/${id}` : `/invoices/${id}?notice=Marked+as+sent.+Set+SERE_SMTP_HOST+to+email+it.`);
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

export async function markNotificationsReadAction() {
  const { org } = await requireContext();
  await db().update(notifications).set({ readAt: nowISO() }).where(eq(notifications.organizationId, org.id));
  redirect("/notifications");
}

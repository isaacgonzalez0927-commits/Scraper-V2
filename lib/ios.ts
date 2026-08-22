import { and, desc, eq, isNull } from "drizzle-orm";
import { currentContext } from "./auth";
import { boot } from "./boot";
import { tradeCopy } from "./business";
import { db } from "./db";
import { displayName } from "./display";
import { balanceCents } from "./finance";
import { label, prettyDate, prettyWhen } from "./labels";
import { formatMoney } from "./money";
import { dossierHeadline, loadDossier } from "./nova/dossier";
import { paidMap } from "./queries";
import { customers, invoices, jobs } from "./schema";
import { DEMO_EMAIL } from "./seed";
import { SERENITY_NAME, SERENITY_PATH } from "./serenity";
import { parseShopMode, shopModeLabel } from "./shop-mode";
import { ensureTrialClock, shopAccess } from "./trial";

export async function requireIosContext(request: Request) {
  await boot();
  const ctx = await currentContext(request);
  if (!ctx) return null;
  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  return { ...ctx, org, access, isDemo };
}

export function iosSessionPayload(ctx: {
  user: { id: number; name: string; email: string };
  org: { id: number; name: string; businessType: string; operatingMode?: string };
  access: { status: string; frozen: boolean };
}) {
  const voice = tradeCopy(ctx.org.businessType);
  return {
    assistant: SERENITY_NAME,
    assistantPath: SERENITY_PATH,
    user: {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
    },
    shop: {
      id: ctx.org.id,
      name: ctx.org.name,
      trade: voice.name,
      jobsLabel: voice.jobs,
      customersLabel: voice.customers,
      mode: parseShopMode(ctx.org.operatingMode),
      modeLabel: shopModeLabel(parseShopMode(ctx.org.operatingMode)),
      frozen: ctx.access.frozen,
      plan: ctx.access.status,
    },
  };
}

export async function iosHome(organizationId: number, isDemo: boolean) {
  const dossier = await loadDossier(organizationId, isDemo);
  return {
    assistant: SERENITY_NAME,
    assistantPath: SERENITY_PATH,
    shop: dossier.shop,
    trade: dossier.trade,
    headline: dossierHeadline(dossier),
    money: dossier.money,
    today: dossier.board.today,
    overdue: dossier.invoices.overdue,
    finishedNotInvoiced: dossier.board.finishedNotInvoiced,
    followUps: dossier.followUps.slice(0, 5),
  };
}

export async function iosJobs(organizationId: number) {
  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(eq(jobs.organizationId, organizationId))
    .orderBy(desc(jobs.id))
    .limit(80);
  return rows.map(({ job, customer }) => ({
    id: job.id,
    title: job.title,
    customer: displayName(customer),
    when: prettyWhen(job.scheduledStart) || "Unscheduled",
    status: job.status,
    statusLabel: label(job.status),
    amount: formatMoney(job.actualRevenueCents || job.estimatedRevenueCents),
    href: `/jobs/${job.id}`,
  }));
}

export async function iosInvoices(organizationId: number) {
  const rows = await db()
    .select({ invoice: invoices, customer: customers })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.organizationId, organizationId)))
    .orderBy(desc(invoices.id))
    .limit(80);
  const paid = await paidMap(
    organizationId,
    rows.map((row) => row.invoice.id),
  );
  return rows.map(({ invoice, customer }) => {
    const balance = balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status);
    return {
      id: invoice.id,
      number: invoice.number,
      customer: displayName(customer),
      issued: prettyDate(invoice.issueDate),
      due: prettyDate(invoice.dueDate),
      status: invoice.status,
      statusLabel: label(invoice.status),
      total: formatMoney(invoice.totalCents),
      balance: formatMoney(balance),
      href: `/invoices/${invoice.id}`,
    };
  });
}

export async function iosCustomers(organizationId: number) {
  const rows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), isNull(customers.archivedAt)))
    .orderBy(desc(customers.id))
    .limit(80);
  return rows.map((row) => ({
    id: row.id,
    name: displayName(row),
    phone: row.phone,
    email: row.email,
    href: `/customers/${row.id}`,
  }));
}

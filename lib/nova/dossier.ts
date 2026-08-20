/**
 * The shop dossier Nova reasons over.
 *
 * RideBy's Nova has `business.ts`, a fleet-wide read of revenue, clients, and
 * activation. Sere's equivalent is one shop: the board today, what is owed,
 * what actually landed in the bank, and where the profit went.
 *
 * Every number here is queried, never estimated, because Nova is told never to
 * invent a figure and this is the only place figures come from.
 */

import { and, desc, eq, ne } from "drizzle-orm";
import { countLabel, tradeCopy } from "../business";
import { db } from "../db";
import { displayName } from "../display";
import { formatMoney } from "../money";
import { prettyDate, prettyWhen } from "../labels";
import {
  collectedCents,
  invoicedRevenueCents,
  isoDate,
  jobCostTotal,
  jobRevenueCents,
  monthBounds,
  outstandingTotals,
  weekBounds,
} from "../queries";
import { customers, invoices, jobs, organizations, payments } from "../schema";
import { integrationStatus } from "../integrations";
import { loadStripeCash } from "../stripe-cash";
import { loadSquareCash } from "../square-cash";
import { shopAccess } from "../trial";

export type DossierJob = {
  id: number;
  title: string;
  customer: string;
  when: string;
  status: string;
  quoted: string;
};

export type DossierInvoice = {
  number: string;
  customer: string;
  amount: string;
  due: string;
  status: string;
};

export type Dossier = {
  shop: string;
  trade: string;
  today: string;
  plan: string;
  trialDaysLeft: number | null;
  money: {
    collectedThisMonth: string;
    invoicedThisMonth: string;
    collectedThisWeek: string;
    outstanding: string;
    overdue: string;
    profitThisMonth: string;
    costsThisMonth: string;
  };
  processors: {
    stripe: string;
    square: string;
    note: string;
  };
  board: {
    today: DossierJob[];
    tomorrow: DossierJob[];
    unscheduled: DossierJob[];
    finishedNotInvoiced: DossierJob[];
  };
  invoices: {
    overdue: DossierInvoice[];
    dueSoon: DossierInvoice[];
    drafts: number;
  };
  followUps: string[];
};

/**
 * One pass over the shop. Deliberately one function returning one object: the
 * model gets a complete picture in a single tool call instead of stitching six.
 */
export async function loadDossier(
  organizationId: number,
  isDemo = false,
  now = new Date(),
): Promise<Dossier> {
  const month = monthBounds(now);
  const week = weekBounds(now);
  const today = isoDate(now);
  const tomorrowDate = new Date(now.getTime());
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = isoDate(tomorrowDate);
  const soon = isoDate(new Date(now.getTime() + 3 * 86_400_000));

  const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
  const voice = tradeCopy(org?.businessType);
  const access = shopAccess(
    { plan: org?.plan || "trial", trialEndsAt: org?.trialEndsAt || "" },
    isDemo,
    now,
  );

  const [collectedMonth, invoicedMonth, collectedWeek, totals, jobRows, invoiceRows, integrations] =
    await Promise.all([
      collectedCents(organizationId, month.start, month.end),
      invoicedRevenueCents(organizationId, month.start, month.end),
      collectedCents(organizationId, week.start, week.end),
      outstandingTotals(organizationId),
      db()
        .select({ job: jobs, customer: customers })
        .from(jobs)
        .innerJoin(customers, eq(customers.id, jobs.customerId))
        .where(and(eq(jobs.organizationId, organizationId), ne(jobs.status, "cancelled"))),
      db()
        .select({ invoice: invoices, customer: customers })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .where(eq(invoices.organizationId, organizationId)),
      integrationStatus(organizationId),
    ]);

  const [stripeCash, squareCash] = await Promise.all([
    loadStripeCash(organizationId, month.start, month.end),
    loadSquareCash(organizationId, month.start, month.end),
  ]);

  function pack(row: { job: typeof jobs.$inferSelect; customer: typeof customers.$inferSelect }): DossierJob {
    return {
      id: row.job.id,
      title: row.job.title,
      customer: displayName(row.customer),
      when: prettyWhen(row.job.scheduledStart) || "unscheduled",
      status: row.job.status,
      quoted: formatMoney(jobRevenueCents(row.job)),
    };
  }

  function packInvoice(row: {
    invoice: typeof invoices.$inferSelect;
    customer: typeof customers.$inferSelect;
  }): DossierInvoice {
    return {
      number: row.invoice.number,
      customer: displayName(row.customer),
      amount: formatMoney(row.invoice.totalCents),
      due: prettyDate(row.invoice.dueDate),
      status: row.invoice.status,
    };
  }

  // Profit is revenue minus logged costs for work that touched this month.
  let profit = 0;
  let costs = 0;
  for (const row of jobRows) {
    const job = row.job;
    if (!["scheduled", "in_progress", "completed"].includes(job.status)) continue;
    const stamp = (job.completedAt || job.scheduledStart || "").slice(0, 10);
    if (!stamp || stamp < month.start || stamp > month.end) continue;
    const cost = await jobCostTotal(organizationId, job.id, job.estimatedCostCents);
    costs += cost;
    profit += jobRevenueCents(job) - cost;
  }

  const invoicedJobIds = new Set(
    invoiceRows.map((row) => row.invoice.jobId).filter((id): id is number => id != null),
  );

  const board = {
    today: jobRows.filter((r) => r.job.scheduledStart?.slice(0, 10) === today).map(pack),
    tomorrow: jobRows.filter((r) => r.job.scheduledStart?.slice(0, 10) === tomorrow).map(pack),
    unscheduled: jobRows
      .filter((r) => !r.job.scheduledStart && r.job.status !== "completed")
      .slice(0, 10)
      .map(pack),
    // The money leak Nova should care about most: work done, never billed.
    finishedNotInvoiced: jobRows
      .filter((r) => r.job.status === "completed" && !invoicedJobIds.has(r.job.id))
      .slice(0, 10)
      .map(pack),
  };

  const overdue = invoiceRows.filter((r) => r.invoice.status === "overdue");
  const dueSoon = invoiceRows.filter((r) => {
    if (!["sent", "viewed", "partial"].includes(r.invoice.status)) return false;
    const due = r.invoice.dueDate?.slice(0, 10) || "";
    return due >= today && due <= soon;
  });

  const followUps: string[] = [];
  for (const row of overdue.slice(0, 5)) {
    const days = daysBetween(row.invoice.dueDate, today);
    followUps.push(
      `${row.invoice.number} · ${displayName(row.customer)} · ${formatMoney(row.invoice.totalCents)} · ${days} day(s) past due`,
    );
  }
  for (const job of board.finishedNotInvoiced.slice(0, 5)) {
    followUps.push(`${job.title} · ${job.customer} · finished, never invoiced`);
  }

  const processorNote = !integrations.stripe.connected && !integrations.square.connected
    ? "No processor connected, so every figure here is what was typed into Sere, not what the bank saw."
    : "Processor figures are live; Sere figures are what was typed in. A gap between them is real information.";

  return {
    shop: org?.name || "this shop",
    trade: voice.name,
    today,
    plan: access.status,
    trialDaysLeft: access.daysLeft,
    money: {
      collectedThisMonth: formatMoney(collectedMonth),
      invoicedThisMonth: formatMoney(invoicedMonth),
      collectedThisWeek: formatMoney(collectedWeek),
      outstanding: formatMoney(totals.outstanding),
      overdue: formatMoney(totals.overdue),
      profitThisMonth: formatMoney(profit),
      costsThisMonth: formatMoney(costs),
    },
    processors: {
      stripe: stripeCash.connected && !stripeCash.error
        ? `${formatMoney(stripeCash.availableCents)} available, ${formatMoney(stripeCash.pendingCents)} pending, ${formatMoney(stripeCash.monthInCents)} charged this month`
        : "not connected",
      square: squareCash.connected && !squareCash.error
        ? `${formatMoney(squareCash.monthInCents)} taken this month`
        : "not connected",
      note: processorNote,
    },
    board,
    invoices: {
      overdue: overdue.slice(0, 10).map(packInvoice),
      dueSoon: dueSoon.slice(0, 10).map(packInvoice),
      drafts: invoiceRows.filter((r) => r.invoice.status === "draft").length,
    },
    followUps,
  };
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse((from || "").slice(0, 10));
  const b = Date.parse((to || "").slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * A short, human summary for the console header and for the opening line of a
 * conversation. Same numbers as the dossier, fewer words.
 */
export function dossierHeadline(dossier: Dossier): string {
  const voiceBits: string[] = [];
  if (dossier.board.today.length) {
    voiceBits.push(`${countLabel(dossier.board.today.length, "job", "jobs")} today`);
  } else if (dossier.board.tomorrow.length) {
    voiceBits.push(`nothing today, ${dossier.board.tomorrow.length} tomorrow`);
  } else {
    voiceBits.push("nothing on the board today");
  }
  if (dossier.invoices.overdue.length) {
    voiceBits.push(`${dossier.money.overdue} overdue`);
  }
  if (dossier.board.finishedNotInvoiced.length) {
    voiceBits.push(`${dossier.board.finishedNotInvoiced.length} finished but never invoiced`);
  }
  voiceBits.push(`${dossier.money.collectedThisWeek} in this week`);
  return voiceBits.join(" · ");
}

/** Recent money in, for "what came in lately". */
export async function recentPayments(organizationId: number, limit = 8): Promise<string[]> {
  const rows = await db()
    .select({ payment: payments, customer: customers })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(eq(payments.organizationId, organizationId))
    .orderBy(desc(payments.paidOn))
    .limit(limit);
  return rows
    .filter((row) => !row.payment.voidedAt)
    .map(
      (row) =>
        `${prettyDate(row.payment.paidOn)} · ${formatMoney(row.payment.amountCents)} · ${displayName(row.customer)} · ${row.payment.method}`,
    );
}

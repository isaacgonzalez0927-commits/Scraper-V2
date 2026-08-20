import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { displayName } from "./display";
import { balanceCents } from "./finance";
import {
  customers,
  invoiceEvents,
  invoices,
  jobCosts,
  jobs,
  payments,
} from "./schema";

type PaymentRow = typeof payments.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type CostRow = typeof jobCosts.$inferSelect;
type EventRow = typeof invoiceEvents.$inferSelect;

export type MoneyTrail = {
  paymentId: number;
  amountCents: number;
  paidOn: string;
  source: string;
  customerName: string;
  invoiceId: number | null;
  invoiceNumber: string;
  jobId: number | null;
  jobTitle: string;
  jobRevenueCents: number;
  jobCostCents: number;
  jobProfitCents: number;
};

export type FollowUp = {
  invoiceId: number;
  invoiceNumber: string;
  customerName: string;
  phone: string;
  email: string;
  balanceCents: number;
  daysOverdue: number;
  remindedToday: boolean;
};

export type OwnerIntelligence = {
  collectedThisMonthCents: number;
  mappedToJobsCents: number;
  unmappedCents: number;
  processorTrackedCents: number;
  mappedJobCount: number;
  mappedJobProfitCents: number;
  currentWeekCents: number;
  priorWeekCents: number;
  trendPercent: number | null;
  overdueCents: number;
  overdueCount: number;
  trails: MoneyTrail[];
  followUps: FollowUp[];
};

export type IntelligenceInput = {
  paymentRows: PaymentRow[];
  invoiceRows: InvoiceRow[];
  customerRows: CustomerRow[];
  jobRows: JobRow[];
  costRows: CostRow[];
  eventRows: EventRow[];
};

function day(iso: string, offset: number): string {
  const value = new Date(`${iso}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function monday(iso: string): string {
  const value = new Date(`${iso}T00:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  return day(iso, -offset);
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function sourceLabel(payment: PaymentRow): string {
  const text = `${payment.notes} ${payment.reference}`.toLowerCase();
  if (text.includes("stripe") || payment.reference.startsWith("cs_")) return "Stripe";
  if (text.includes("square")) return "Square";
  if (payment.method === "card") return "Card";
  if (payment.method === "ach") return "Bank";
  return payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
}

/**
 * Correlates money into the operational chain:
 * payment → invoice → job → actual revenue − job costs.
 *
 * Processor money without a Sere invoice remains explicitly unmapped. The
 * brief never invents attribution just to make the dashboard look complete.
 */
export function buildOwnerIntelligence(
  input: IntelligenceInput,
  today = new Date().toISOString().slice(0, 10),
): OwnerIntelligence {
  const invoiceById = new Map(input.invoiceRows.map((row) => [row.id, row]));
  const customerById = new Map(input.customerRows.map((row) => [row.id, row]));
  const jobById = new Map(input.jobRows.map((row) => [row.id, row]));
  const costsByJob = new Map<number, number>();
  for (const cost of input.costRows) {
    costsByJob.set(cost.jobId, (costsByJob.get(cost.jobId) || 0) + cost.amountCents);
  }

  const activePayments = input.paymentRows.filter((row) => !row.voidedAt);
  const paidByInvoice = new Map<number, number>();
  for (const payment of activePayments) {
    if (!payment.invoiceId) continue;
    paidByInvoice.set(
      payment.invoiceId,
      (paidByInvoice.get(payment.invoiceId) || 0) + payment.amountCents,
    );
  }

  const start = monthStart(today);
  const monthPayments = activePayments
    .filter((row) => row.paidOn >= start && row.paidOn <= today)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id - a.id);

  const trails: MoneyTrail[] = monthPayments.map((payment) => {
    const invoice = payment.invoiceId ? invoiceById.get(payment.invoiceId) : undefined;
    const job = invoice?.jobId ? jobById.get(invoice.jobId) : undefined;
    const customer = customerById.get(payment.customerId);
    const actualCosts = job ? costsByJob.get(job.id) || 0 : 0;
    const jobCostCents = job ? actualCosts || job.estimatedCostCents : 0;
    const jobRevenueCents = job
      ? job.actualRevenueCents || job.estimatedRevenueCents
      : 0;
    return {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      paidOn: payment.paidOn,
      source: sourceLabel(payment),
      customerName: customer ? displayName(customer) : "Unknown customer",
      invoiceId: invoice?.id || null,
      invoiceNumber: invoice?.number || "",
      jobId: job?.id || null,
      jobTitle: job?.title || "",
      jobRevenueCents,
      jobCostCents,
      jobProfitCents: job ? jobRevenueCents - jobCostCents : 0,
    };
  });

  const mapped = trails.filter((trail) => trail.jobId);
  const mappedJobIds = new Set(mapped.flatMap((trail) => trail.jobId || []));
  let mappedJobProfitCents = 0;
  for (const jobId of mappedJobIds) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const cost = costsByJob.get(job.id) || job.estimatedCostCents;
    mappedJobProfitCents +=
      (job.actualRevenueCents || job.estimatedRevenueCents) - cost;
  }

  const thisMonday = monday(today);
  const daysElapsed = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() -
      new Date(`${thisMonday}T00:00:00Z`).getTime()) /
      86400000,
  );
  const priorStart = day(thisMonday, -7);
  const priorEnd = day(priorStart, daysElapsed);
  const currentWeekCents = activePayments
    .filter((row) => row.paidOn >= thisMonday && row.paidOn <= today)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const priorWeekCents = activePayments
    .filter((row) => row.paidOn >= priorStart && row.paidOn <= priorEnd)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const trendPercent = priorWeekCents
    ? Math.round(((currentWeekCents - priorWeekCents) * 100) / priorWeekCents)
    : currentWeekCents
      ? null
      : 0;

  const remindedToday = new Set(
    input.eventRows
      .filter((event) => event.kind === "reminder" && event.createdAt.slice(0, 10) === today)
      .map((event) => event.invoiceId),
  );
  const followUps = input.invoiceRows
    .filter(
      (invoice) =>
        ["sent", "viewed", "partial", "overdue"].includes(invoice.status) &&
        invoice.dueDate < today,
    )
    .map((invoice): FollowUp | null => {
      const due = balanceCents(
        invoice.totalCents,
        paidByInvoice.get(invoice.id) || 0,
        invoice.status,
      );
      if (due <= 0) return null;
      const customer = customerById.get(invoice.customerId);
      const daysOverdue = Math.max(
        1,
        Math.round(
          (new Date(`${today}T00:00:00Z`).getTime() -
            new Date(`${invoice.dueDate}T00:00:00Z`).getTime()) /
            86400000,
        ),
      );
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerName: customer ? displayName(customer) : "Unknown customer",
        phone: customer?.phone || "",
        email: customer?.email || "",
        balanceCents: due,
        daysOverdue,
        remindedToday: remindedToday.has(invoice.id),
      };
    })
    .filter((row): row is FollowUp => Boolean(row))
    .sort((a, b) => b.balanceCents - a.balanceCents);

  return {
    collectedThisMonthCents: trails.reduce((sum, row) => sum + row.amountCents, 0),
    mappedToJobsCents: mapped.reduce((sum, row) => sum + row.amountCents, 0),
    unmappedCents: trails
      .filter((trail) => !trail.jobId)
      .reduce((sum, row) => sum + row.amountCents, 0),
    processorTrackedCents: trails
      .filter((trail) => trail.source === "Stripe" || trail.source === "Square")
      .reduce((sum, row) => sum + row.amountCents, 0),
    mappedJobCount: mappedJobIds.size,
    mappedJobProfitCents,
    currentWeekCents,
    priorWeekCents,
    trendPercent,
    overdueCents: followUps.reduce((sum, row) => sum + row.balanceCents, 0),
    overdueCount: followUps.length,
    trails: trails.slice(0, 8),
    followUps: followUps.slice(0, 5),
  };
}

export async function loadOwnerIntelligence(
  organizationId: number,
  now = new Date(),
): Promise<OwnerIntelligence> {
  const [paymentRows, invoiceRows, customerRows, jobRows, costRows, eventRows] =
    await Promise.all([
      db()
        .select()
        .from(payments)
        .where(and(eq(payments.organizationId, organizationId), isNull(payments.voidedAt))),
      db().select().from(invoices).where(eq(invoices.organizationId, organizationId)),
      db().select().from(customers).where(eq(customers.organizationId, organizationId)),
      db().select().from(jobs).where(eq(jobs.organizationId, organizationId)),
      db().select().from(jobCosts).where(eq(jobCosts.organizationId, organizationId)),
      db().select().from(invoiceEvents).where(eq(invoiceEvents.organizationId, organizationId)),
    ]);
  return buildOwnerIntelligence(
    { paymentRows, invoiceRows, customerRows, jobRows, costRows, eventRows },
    now.toISOString().slice(0, 10),
  );
}

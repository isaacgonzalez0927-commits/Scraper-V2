import { and, eq, isNull } from "drizzle-orm";
import {
  collectTotals,
  describeCollect,
  jobIsUnbilled,
  rankCollectRows,
  type CollectInput,
  type CollectRow,
} from "./collect";
import { db } from "./db";
import { displayName } from "./display";
import { balanceCents } from "./finance";
import { paidMap } from "./queries";
import { customers, estimates, invoices, jobs } from "./schema";

export { collectTotals, describeCollect, jobIsUnbilled, rankCollectRows };
export type { CollectInput, CollectRow };

export async function loadCollectQueue(
  organizationId: number,
  opts: { customerId?: number; today?: string } = {},
): Promise<CollectRow[]> {
  const today = opts.today || new Date().toISOString().slice(0, 10);

  const [jobRows, invoiceRows, estimateRows, customerRows] = await Promise.all([
    db()
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(
        opts.customerId
          ? and(eq(jobs.organizationId, organizationId), eq(jobs.customerId, opts.customerId))
          : eq(jobs.organizationId, organizationId),
      ),
    db()
      .select({ invoice: invoices, customer: customers })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(
        opts.customerId
          ? and(eq(invoices.organizationId, organizationId), eq(invoices.customerId, opts.customerId))
          : eq(invoices.organizationId, organizationId),
      ),
    db()
      .select({ estimate: estimates, customer: customers })
      .from(estimates)
      .innerJoin(customers, eq(customers.id, estimates.customerId))
      .where(
        opts.customerId
          ? and(eq(estimates.organizationId, organizationId), eq(estimates.customerId, opts.customerId))
          : eq(estimates.organizationId, organizationId),
      ),
    opts.customerId
      ? db()
          .select()
          .from(customers)
          .where(
            and(eq(customers.organizationId, organizationId), eq(customers.id, opts.customerId)),
          )
      : db()
          .select()
          .from(customers)
          .where(
            and(eq(customers.organizationId, organizationId), isNull(customers.archivedAt)),
          ),
  ]);

  const invoicedJobIds = new Set(
    invoiceRows
      .filter((row) => row.invoice.status !== "void" && row.invoice.jobId)
      .map((row) => row.invoice.jobId as number),
  );
  const paid = await paidMap(
    organizationId,
    invoiceRows.map((row) => row.invoice.id),
  );

  const inputs: CollectInput[] = [];

  for (const { job, customer } of jobRows) {
    if (!jobIsUnbilled(job, invoicedJobIds)) continue;
    const amount = job.actualRevenueCents || job.estimatedRevenueCents;
    inputs.push({
      kind: "unbilled",
      id: job.id,
      customerId: customer.id,
      customerName: displayName(customer),
      phone: customer.phone,
      title: job.title,
      amountCents: amount,
      sortAt: job.completedAt || job.createdAt,
    });
  }

  for (const { invoice, customer } of invoiceRows) {
    if (invoice.status === "void" || invoice.status === "paid") continue;
    const paidCents = paid.get(invoice.id) || 0;
    const remaining = balanceCents(invoice.totalCents, paidCents, invoice.status);
    if (invoice.status === "draft") {
      inputs.push({
        kind: "draft",
        id: invoice.id,
        customerId: customer.id,
        customerName: displayName(customer),
        phone: customer.phone,
        title: invoice.number,
        amountCents: invoice.totalCents,
        sortAt: invoice.createdAt,
        publicToken: invoice.publicToken,
      });
      continue;
    }
    if (remaining <= 0) continue;
    inputs.push({
      kind: "open",
      id: invoice.id,
      customerId: customer.id,
      customerName: displayName(customer),
      phone: customer.phone,
      title: invoice.number,
      amountCents: remaining,
      sortAt: invoice.dueDate,
      overdue: invoice.status === "overdue",
      publicToken: invoice.publicToken,
    });
  }

  for (const { estimate, customer } of estimateRows) {
    if (estimate.status !== "approved" || estimate.convertedJobId) continue;
    inputs.push({
      kind: "estimate",
      id: estimate.id,
      customerId: customer.id,
      customerName: displayName(customer),
      phone: customer.phone,
      title: estimate.number,
      amountCents: estimate.totalCents,
      sortAt: estimate.approvedAt || estimate.createdAt,
    });
  }

  for (const customer of customerRows) {
    if (!customer.followUpOn || customer.followUpOn > today) continue;
    if (customer.archivedAt) continue;
    inputs.push({
      kind: "followup",
      id: customer.id,
      customerId: customer.id,
      customerName: displayName(customer),
      phone: customer.phone,
      title: customer.followUpNote || "Follow up",
      amountCents: 0,
      sortAt: customer.followUpOn,
    });
  }

  return rankCollectRows(inputs);
}

export async function collectCount(organizationId: number): Promise<number> {
  return (await loadCollectQueue(organizationId)).length;
}

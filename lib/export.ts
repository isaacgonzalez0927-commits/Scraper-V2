import { eq } from "drizzle-orm";
import { csvFileName, csvTable } from "./csv";
import { db } from "./db";
import { displayName } from "./display";
import { balanceCents } from "./finance";
import { label, prettyDate, prettyWhen } from "./labels";
import { jobRevenueCents, paidMap } from "./queries";
import { customers, invoices, jobs, payments } from "./schema";

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type ExportKind = "payments" | "invoices" | "jobs";

export function isExportKind(value: string): value is ExportKind {
  return value === "payments" || value === "invoices" || value === "jobs";
}

export async function buildExport(
  organizationId: number,
  kind: ExportKind,
  day: string,
): Promise<{ filename: string; body: string }> {
  if (kind === "payments") {
    const rows = await db()
      .select({ payment: payments, customer: customers, invoice: invoices })
      .from(payments)
      .innerJoin(customers, eq(customers.id, payments.customerId))
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(eq(payments.organizationId, organizationId));
    return {
      filename: csvFileName("payments", day),
      body: csvTable(
        ["Date", "Customer", "Invoice", "Method", "Reference", "Amount", "Voided"],
        rows.map(({ payment, customer, invoice }) => [
          payment.paidOn,
          displayName(customer),
          invoice?.number || "",
          label(payment.method),
          payment.reference,
          dollars(payment.amountCents),
          payment.voidedAt ? "yes" : "",
        ]),
      ),
    };
  }

  if (kind === "invoices") {
    const rows = await db()
      .select({ invoice: invoices, customer: customers })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(eq(invoices.organizationId, organizationId));
    const paid = await paidMap(organizationId, rows.map((r) => r.invoice.id));
    return {
      filename: csvFileName("invoices", day),
      body: csvTable(
        ["Number", "Customer", "Issued", "Due", "Status", "Total", "Balance"],
        rows.map(({ invoice, customer }) => {
          const balance = balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status);
          return [
            invoice.number,
            displayName(customer),
            prettyDate(invoice.issueDate),
            prettyDate(invoice.dueDate),
            label(invoice.status),
            dollars(invoice.totalCents),
            dollars(balance),
          ];
        }),
      ),
    };
  }

  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(eq(jobs.organizationId, organizationId));
  return {
    filename: csvFileName("jobs", day),
    body: csvTable(
      ["Job", "Customer", "Scheduled", "Assigned", "Status", "Est. revenue"],
      rows.map(({ job, customer }) => [
        job.title,
        displayName(customer),
        prettyWhen(job.scheduledStart) || "",
        job.technicianName,
        label(job.status),
        dollars(jobRevenueCents(job)),
      ]),
    ),
  };
}

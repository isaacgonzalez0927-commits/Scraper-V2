import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { InvoiceSheet } from "@/components/InvoiceSheet";
import { db } from "@/lib/db";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { loadApp } from "@/lib/page";
import { customers, invoiceLines, invoices } from "@/lib/schema";

export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await loadApp();
  const { id } = await params;
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, Number(id)), eq(invoices.organizationId, org.id)));
  if (!invoice) notFound();
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  const lines = await db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
  const paid = await amountPaidCents(invoice.id);
  return (
    <InvoiceSheet
      org={org}
      invoice={invoice}
      customer={customer}
      lines={lines}
      paid={paid}
      balance={balanceCents(invoice.totalCents, paid, invoice.status)}
    />
  );
}

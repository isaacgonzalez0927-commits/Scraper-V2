import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { InvoiceSheet } from "@/components/InvoiceSheet";
import { boot } from "@/lib/boot";
import { db, nowISO } from "@/lib/db";
import { addEvent, amountPaidCents, balanceCents, notify, refreshInvoice } from "@/lib/finance";
import { customers, invoiceLines, invoices, organizations } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await boot();
  const { token } = await params;
  const [invoice] = await db().select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice) notFound();
  const [org] = await db().select().from(organizations).where(eq(organizations.id, invoice.organizationId));
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  const lines = await db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));

  if (!invoice.viewedAt && invoice.status !== "void") {
    await db().update(invoices).set({ viewedAt: nowISO() }).where(eq(invoices.id, invoice.id));
    await addEvent(org.id, invoice.id, "viewed", "Customer viewed invoice");
    await notify(org.id, "invoice_viewed", `${invoice.number} was viewed`, "", `/invoices/${invoice.id}`);
    await refreshInvoice(invoice.id, org.id);
  }

  const [fresh] = await db().select().from(invoices).where(eq(invoices.id, invoice.id));
  const paid = await amountPaidCents(invoice.id);
  return (
    <InvoiceSheet
      org={org}
      invoice={fresh}
      customer={customer}
      lines={lines}
      paid={paid}
      balance={balanceCents(fresh.totalCents, paid, fresh.status)}
      publicView
    />
  );
}

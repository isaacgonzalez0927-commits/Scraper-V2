import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/InvoiceForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers, invoiceLines, invoices, jobs, serviceItems } from "@/lib/schema";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, Number(id)), eq(invoices.organizationId, org.id)));
  if (!invoice) notFound();
  if (invoice.status === "paid" || invoice.status === "void") redirect(`/invoices/${invoice.id}`);
  const [lines, customerRows, jobRows, services] = await Promise.all([
    db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id)),
    db().select().from(customers).where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt))),
    db().select().from(jobs).where(eq(jobs.organizationId, org.id)),
    db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id)),
  ]);
  return (
    <Shell
      {...shell}
      path="/invoices"
      title={`Edit ${invoice.number}`}
      sub={<p className="page-sub">A paid or void invoice can no longer be edited.</p>}
      actions={<a className="btn btn-secondary" href={`/invoices/${invoice.id}`}>Cancel</a>}
    >
      <InvoiceForm
        invoice={invoice}
        lines={lines}
        customerRows={customerRows}
        jobRows={jobRows}
        services={services}
        defaultTaxBps={org.defaultTaxBps}
        defaultNotes={org.defaultInvoiceNotes}
        termsDays={org.paymentTermsDays}
      />
    </Shell>
  );
}

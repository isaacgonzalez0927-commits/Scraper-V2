import { and, eq, isNull } from "drizzle-orm";
import { InvoiceForm } from "@/components/InvoiceForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers, jobs, serviceItems } from "@/lib/schema";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; jobId?: string; error?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const [customerRows, jobRows, services] = await Promise.all([
    db().select().from(customers).where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt))),
    db().select().from(jobs).where(eq(jobs.organizationId, org.id)),
    db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id)),
  ]);
  return (
    <Shell
      {...shell}
      path="/invoices"
      title="New invoice"
      sub={<p className="page-sub">Numbered {org.invoicePrefix}{org.nextInvoiceNumber} when you save it.</p>}
      actions={<a className="btn btn-secondary" href="/invoices">Cancel</a>}
    >
      <InvoiceForm
        customerRows={customerRows}
        jobRows={jobRows}
        services={services}
        error={q.error}
        defaultCustomerId={q.customerId ? Number(q.customerId) : undefined}
        defaultJobId={q.jobId ? Number(q.jobId) : undefined}
        defaultTaxBps={org.defaultTaxBps}
        defaultNotes={org.defaultInvoiceNotes}
        termsDays={org.paymentTermsDays}
      />
    </Shell>
  );
}

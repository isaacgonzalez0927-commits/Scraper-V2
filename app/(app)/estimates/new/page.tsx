import { and, eq, isNull } from "drizzle-orm";
import { EstimateForm } from "@/components/EstimateForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers, serviceItems } from "@/lib/schema";

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; error?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const [customerRows, services] = await Promise.all([
    db().select().from(customers).where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt))),
    db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id)),
  ]);
  return (
    <Shell
      {...shell}
      path="/estimates"
      title="New estimate"
      sub={<p className="page-sub">Numbered {org.estimatePrefix}{org.nextEstimateNumber} when you save it.</p>}
      actions={<a className="btn btn-secondary" href="/estimates">Cancel</a>}
    >
      <EstimateForm
        customerRows={customerRows}
        services={services}
        error={q.error}
        defaultCustomerId={q.customerId ? Number(q.customerId) : undefined}
        defaultTaxBps={org.defaultTaxBps}
      />
    </Shell>
  );
}

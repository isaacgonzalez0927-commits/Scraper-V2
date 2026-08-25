import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { EstimateForm } from "@/components/EstimateForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { canEditEstimate } from "@/lib/estimates";
import { loadApp } from "@/lib/page";
import { customers, estimateLines, estimates, serviceItems } from "@/lib/schema";

export default async function EditEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const q = await searchParams;
  const [estimate] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, Number(id)), eq(estimates.organizationId, org.id)));
  if (!estimate) notFound();
  if (!canEditEstimate(estimate.status)) redirect(`/estimates/${estimate.id}`);
  const [lines, customerRows, services] = await Promise.all([
    db()
      .select()
      .from(estimateLines)
      .where(and(eq(estimateLines.estimateId, estimate.id), eq(estimateLines.organizationId, org.id))),
    db().select().from(customers).where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt))),
    db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id)),
  ]);
  return (
    <Shell
      {...shell}
      path="/estimates"
      title={`Edit ${estimate.number}`}
      sub={<p className="page-sub">Editing a sent estimate returns it to draft for review.</p>}
      actions={<a className="btn btn-secondary" href={`/estimates/${estimate.id}`}>Cancel</a>}
    >
      <EstimateForm
        estimate={estimate}
        lines={lines}
        customerRows={customerRows}
        services={services}
        error={q.error}
        defaultTaxBps={org.defaultTaxBps}
      />
    </Shell>
  );
}

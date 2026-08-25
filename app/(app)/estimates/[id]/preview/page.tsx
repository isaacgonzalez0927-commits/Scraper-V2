import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EstimateSheet } from "@/components/EstimateSheet";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers, estimateLines, estimates } from "@/lib/schema";

export default async function EstimatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await loadApp();
  const { id } = await params;
  const [estimate] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, Number(id)), eq(estimates.organizationId, org.id)));
  if (!estimate) notFound();
  const [customer, lines] = await Promise.all([
    db()
      .select()
      .from(customers)
      .where(and(eq(customers.id, estimate.customerId), eq(customers.organizationId, org.id)))
      .then((rows) => rows[0]),
    db()
      .select()
      .from(estimateLines)
      .where(and(eq(estimateLines.estimateId, estimate.id), eq(estimateLines.organizationId, org.id))),
  ]);
  if (!customer) notFound();
  return <EstimateSheet org={org} estimate={estimate} customer={customer} lines={lines} />;
}

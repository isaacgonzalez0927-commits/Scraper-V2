import { and, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EstimateSheet } from "@/components/EstimateSheet";
import { boot } from "@/lib/boot";
import { db, nowISO } from "@/lib/db";
import { addEstimateEvent } from "@/lib/estimates";
import { notify } from "@/lib/finance";
import { customers, estimateLines, estimates, organizations } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await boot();
  const { token } = await params;
  const q = await searchParams;
  const [estimate] = await db().select().from(estimates).where(eq(estimates.publicToken, token));
  if (!estimate) notFound();
  const [org, customer, lines] = await Promise.all([
    db().select().from(organizations).where(eq(organizations.id, estimate.organizationId)).then((rows) => rows[0]),
    db()
      .select()
      .from(customers)
      .where(and(eq(customers.id, estimate.customerId), eq(customers.organizationId, estimate.organizationId)))
      .then((rows) => rows[0]),
    db()
      .select()
      .from(estimateLines)
      .where(
        and(
          eq(estimateLines.estimateId, estimate.id),
          eq(estimateLines.organizationId, estimate.organizationId),
        ),
      ),
  ]);
  if (!org || !customer) notFound();

  const now = nowISO();
  const viewed = await db()
    .update(estimates)
    .set({ status: "viewed", viewedAt: now, updatedAt: now })
    .where(
      and(
        eq(estimates.id, estimate.id),
        eq(estimates.organizationId, estimate.organizationId),
        inArray(estimates.status, ["sent", "viewed"]),
        isNull(estimates.viewedAt),
      ),
    )
    .returning({ id: estimates.id });
  if (viewed.length) {
    await addEstimateEvent(org.id, estimate.id, "viewed", "Customer viewed the estimate");
    await notify(org.id, "estimate_viewed", `${estimate.number} was viewed`, "", `/estimates/${estimate.id}`);
  }
  const [fresh] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimate.id), eq(estimates.organizationId, org.id)));

  return (
    <EstimateSheet
      org={org}
      estimate={fresh}
      customer={customer}
      lines={lines}
      publicView
      publicToken={token}
      ok={q.ok}
      error={q.error}
    />
  );
}

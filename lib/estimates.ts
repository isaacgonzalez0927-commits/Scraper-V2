import { and, eq, isNull, sql } from "drizzle-orm";
import { db, nowISO } from "./db";
import { lineAmountCents, taxCents } from "./money";
import { customers, estimateEvents, estimateLines, estimates, jobs, organizations } from "./schema";

export const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "approved",
  "declined",
  "converted",
  "void",
] as const;

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export function estimateTotals(
  lines: { quantity: string | number; unitPriceCents: number }[],
  discountCents: number,
  taxBps: number,
) {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + lineAmountCents(line.quantity, Math.round(line.unitPriceCents)),
    0,
  );
  const discount = Math.max(0, Math.min(Math.round(discountCents), subtotalCents));
  const tax = taxCents(subtotalCents - discount, Math.max(0, Math.round(taxBps)));
  return {
    subtotalCents,
    discountCents: discount,
    taxCents: tax,
    totalCents: subtotalCents - discount + tax,
  };
}

export function estimateStatus(input: {
  status: string;
  sentAt?: string | null;
  viewedAt?: string | null;
  approvedAt?: string | null;
  declinedAt?: string | null;
  convertedAt?: string | null;
  voidedAt?: string | null;
}): EstimateStatus {
  if (input.voidedAt || input.status === "void") return "void";
  if (input.convertedAt || input.status === "converted") return "converted";
  if (input.approvedAt || input.status === "approved") return "approved";
  if (input.declinedAt || input.status === "declined") return "declined";
  if (input.viewedAt || input.status === "viewed") return "viewed";
  if (input.sentAt || input.status === "sent") return "sent";
  return "draft";
}

export function canEditEstimate(status: string): boolean {
  return status === "draft" || status === "sent" || status === "viewed";
}

export function canCustomerRespond(status: string): boolean {
  return status === "sent" || status === "viewed";
}

export async function nextEstimateNumber(organizationId: number): Promise<string> {
  const [org] = await db()
    .update(organizations)
    .set({ nextEstimateNumber: sql`${organizations.nextEstimateNumber} + 1` })
    .where(eq(organizations.id, organizationId))
    .returning({
      prefix: organizations.estimatePrefix,
      next: organizations.nextEstimateNumber,
    });
  if (!org) throw new Error("Organization not found.");
  return `${org.prefix}${org.next - 1}`;
}

export async function addEstimateEvent(
  organizationId: number,
  estimateId: number,
  kind: string,
  message: string,
): Promise<void> {
  const [estimate] = await db()
    .select({ id: estimates.id })
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.organizationId, organizationId)));
  if (!estimate) throw new Error("Estimate not found.");
  await db().insert(estimateEvents).values({
    organizationId,
    estimateId,
    kind,
    message,
    createdAt: nowISO(),
  });
}

export async function estimateWithRelations(organizationId: number, estimateId: number) {
  const [estimate] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.organizationId, organizationId)));
  if (!estimate) return null;
  const [customer, lines] = await Promise.all([
    db()
      .select()
      .from(customers)
      .where(and(eq(customers.id, estimate.customerId), eq(customers.organizationId, organizationId)))
      .then((rows) => rows[0]),
    db()
      .select()
      .from(estimateLines)
      .where(and(eq(estimateLines.estimateId, estimate.id), eq(estimateLines.organizationId, organizationId))),
  ]);
  if (!customer) return null;
  return { estimate, customer, lines };
}

/**
 * Creates one unscheduled job from a customer-approved estimate. The status
 * claim, job insert, and back-reference commit together, so retries return the
 * original job and cannot create duplicates.
 */
export async function convertApprovedEstimate(
  organizationId: number,
  estimateId: number,
): Promise<{ jobId: number; created: boolean }> {
  return db().transaction(async (tx) => {
    const [estimate] = await tx
      .select()
      .from(estimates)
      .where(and(eq(estimates.id, estimateId), eq(estimates.organizationId, organizationId)));
    if (!estimate) throw new Error("Estimate not found.");
    if (estimate.convertedJobId) return { jobId: estimate.convertedJobId, created: false };
    if (estimate.status !== "approved" || !estimate.approvedAt) {
      throw new Error("The customer must approve this estimate before it can become a job.");
    }

    const now = nowISO();
    const claimed = await tx
      .update(estimates)
      .set({ status: "converted", convertedAt: now, updatedAt: now })
      .where(
        and(
          eq(estimates.id, estimate.id),
          eq(estimates.organizationId, organizationId),
          eq(estimates.status, "approved"),
          isNull(estimates.convertedJobId),
        ),
      )
      .returning({ id: estimates.id });
    if (!claimed.length) {
      const [fresh] = await tx
        .select({ jobId: estimates.convertedJobId })
        .from(estimates)
        .where(and(eq(estimates.id, estimate.id), eq(estimates.organizationId, organizationId)));
      if (fresh?.jobId) return { jobId: fresh.jobId, created: false };
      throw new Error("Estimate conversion is already in progress.");
    }

    const [customer, lines] = await Promise.all([
      tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, estimate.customerId), eq(customers.organizationId, organizationId)))
        .then((rows) => rows[0]),
      tx
        .select()
        .from(estimateLines)
        .where(and(eq(estimateLines.estimateId, estimate.id), eq(estimateLines.organizationId, organizationId))),
    ]);
    if (!customer) throw new Error("Estimate customer not found.");
    const [job] = await tx
      .insert(jobs)
      .values({
        organizationId,
        customerId: estimate.customerId,
        title: lines[0]?.description || `Work from ${estimate.number}`,
        description: lines.map((line) => `${line.quantity} × ${line.description}`).join("\n"),
        serviceLine1: customer.serviceLine1,
        serviceCity: customer.serviceCity,
        serviceState: customer.serviceState,
        servicePostal: customer.servicePostal,
        status: "unscheduled",
        estimatedRevenueCents: estimate.totalCents,
        notes: estimate.notes,
        createdAt: now,
      })
      .returning({ id: jobs.id });
    await tx
      .update(estimates)
      .set({ convertedJobId: job.id })
      .where(and(eq(estimates.id, estimate.id), eq(estimates.organizationId, organizationId)));
    await tx.insert(estimateEvents).values({
      organizationId,
      estimateId: estimate.id,
      kind: "converted",
      message: `Converted to job ${job.id}`,
      createdAt: now,
    });
    return { jobId: job.id, created: true };
  });
}

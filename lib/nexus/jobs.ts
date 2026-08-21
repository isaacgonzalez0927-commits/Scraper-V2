/**
 * The work queue behind Nova's outreach.
 *
 * Ported from RideBy's nexus/jobs.ts, Supabase swapped for Drizzle. Same
 * design, and each part of it is load-bearing:
 *
 * - dedupe keys, so asking Nova to research the same company twice is free
 * - exponential backoff, so a site that times out does not get hammered
 * - a lock stamp, so two overlapping ticks cannot run the same job
 * - a stale sweep, so a job orphaned by a crashed tick comes back
 */

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, nowISO } from "../db";
import { nexusActions, nexusJobs } from "../schema";

export type JobType =
  | "lead.search"
  | "research.company"
  | "outreach.draft"
  | "outreach.review"
  | "outreach.send";

export type NexusJob = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

/** Waits between retries. The last value repeats once attempts run past it. */
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200];

/** A job locked longer than this is assumed dead and gets swept back. */
const STALE_LOCK_MINUTES = 15;

function laterISO(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  options: { dedupeKey?: string; delaySeconds?: number } = {},
): Promise<number | null> {
  const dedupeKey = (options.dedupeKey || "").trim();
  if (dedupeKey) {
    const [existing] = await db()
      .select({ id: nexusJobs.id })
      .from(nexusJobs)
      .where(
        and(
          eq(nexusJobs.dedupeKey, dedupeKey),
          or(eq(nexusJobs.status, "queued"), eq(nexusJobs.status, "running")),
        ),
      );
    if (existing) return null;
  }
  const stamp = nowISO();
  const [row] = await db()
    .insert(nexusJobs)
    .values({
      type,
      payload: JSON.stringify(payload),
      status: "queued",
      runAfter: laterISO(options.delaySeconds || 0),
      dedupeKey,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning({ id: nexusJobs.id });
  return row?.id ?? null;
}

/**
 * Takes up to `limit` jobs that are due, marking them running so a second tick
 * cannot pick them up. Claimed one at a time on purpose: libSQL has no
 * SELECT ... FOR UPDATE, so the conditional update is the lock.
 */
export async function claimJobs(limit: number): Promise<NexusJob[]> {
  const now = nowISO();
  const claimed: NexusJob[] = [];
  for (let i = 0; i < limit; i += 1) {
    const [candidate] = await db()
      .select()
      .from(nexusJobs)
      .where(and(eq(nexusJobs.status, "queued"), lte(nexusJobs.runAfter, now)))
      .orderBy(asc(nexusJobs.runAfter), asc(nexusJobs.id))
      .limit(1);
    if (!candidate) break;
    const result = await db()
      .update(nexusJobs)
      .set({ status: "running", lockedAt: now, updatedAt: now })
      .where(and(eq(nexusJobs.id, candidate.id), eq(nexusJobs.status, "queued")));
    if (!result.rowsAffected) continue;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(candidate.payload) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    claimed.push({
      id: candidate.id,
      type: candidate.type,
      payload,
      attempts: candidate.attempts,
      maxAttempts: candidate.maxAttempts,
    });
  }
  return claimed;
}

export async function completeJob(id: number): Promise<void> {
  const now = nowISO();
  await db()
    .update(nexusJobs)
    .set({ status: "done", lockedAt: null, updatedAt: now })
    .where(eq(nexusJobs.id, id));
}

/** Retries with backoff until max attempts, then parks the job as failed. */
export async function failJob(job: NexusJob, error: string): Promise<void> {
  const attempts = job.attempts + 1;
  const now = nowISO();
  if (attempts >= job.maxAttempts) {
    await db()
      .update(nexusJobs)
      .set({
        status: "failed",
        attempts,
        lastError: error.slice(0, 500),
        lockedAt: null,
        updatedAt: now,
      })
      .where(eq(nexusJobs.id, job.id));
    return;
  }
  const wait = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
  await db()
    .update(nexusJobs)
    .set({
      status: "queued",
      attempts,
      lastError: error.slice(0, 500),
      lockedAt: null,
      runAfter: laterISO(wait),
      updatedAt: now,
    })
    .where(eq(nexusJobs.id, job.id));
}

/** Brings back jobs whose tick died mid-run. */
export async function requeueStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MINUTES * 60_000).toISOString();
  const result = await db()
    .update(nexusJobs)
    .set({ status: "queued", lockedAt: null, updatedAt: nowISO() })
    .where(and(eq(nexusJobs.status, "running"), lte(nexusJobs.lockedAt, cutoff)));
  return result.rowsAffected;
}

export async function logAction(input: {
  action: string;
  entityType?: string;
  entityId?: string | number;
  detail?: string;
  actor?: string;
}): Promise<void> {
  await db().insert(nexusActions).values({
    actor: input.actor || "nova",
    action: input.action,
    entityType: input.entityType || "",
    entityId: input.entityId == null ? "" : String(input.entityId),
    detail: (input.detail || "").slice(0, 500),
    createdAt: nowISO(),
  });
}

export type QueueDepth = {
  queued: number;
  running: number;
  failed: number;
  byType: Record<string, number>;
};

export async function queueDepth(): Promise<QueueDepth> {
  const rows = await db()
    .select({
      type: nexusJobs.type,
      status: nexusJobs.status,
      count: sql<number>`count(*)`,
    })
    .from(nexusJobs)
    .groupBy(nexusJobs.type, nexusJobs.status);
  const depth: QueueDepth = { queued: 0, running: 0, failed: 0, byType: {} };
  for (const row of rows) {
    const count = Number(row.count);
    if (row.status === "queued") depth.queued += count;
    if (row.status === "running") depth.running += count;
    if (row.status === "failed") depth.failed += count;
    if (row.status === "queued") depth.byType[row.type] = (depth.byType[row.type] || 0) + count;
  }
  return depth;
}

/** Clears finished rows so the table does not grow forever. */
export async function pruneJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const result = await db()
    .delete(nexusJobs)
    .where(and(eq(nexusJobs.status, "done"), lte(nexusJobs.updatedAt, cutoff)));
  return result.rowsAffected;
}

export async function unlockedJobCount(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(nexusJobs)
    .where(and(eq(nexusJobs.status, "running"), isNull(nexusJobs.lockedAt)));
  return Number(row?.count || 0);
}

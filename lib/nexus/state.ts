/**
 * The read model behind Nova's outreach answers.
 *
 * Ported from RideBy's nexus/state.ts. One query pass, so Nova can report the
 * pipeline, the send posture, and what the numbers say without four tool calls.
 */

import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { nexusActions, nexusCompanies, nexusDrafts } from "../schema";
import { queueDepth } from "./jobs";
import { leadRunway } from "./hands/lead";
import { sendPosture } from "./hands/send";
import { isWinner, reviewFloor, scoreOutcome } from "./policy";

export type OutreachState = {
  pipeline: {
    total: number;
    byStage: Record<string, number>;
    runway: Awaited<ReturnType<typeof leadRunway>>;
  };
  drafts: {
    pendingReview: number;
    approved: number;
    rejected: number;
    sent: number;
    reviewFloor: number;
  };
  send: Awaited<ReturnType<typeof sendPosture>>;
  learning: {
    sent: number;
    replies: number;
    signups: number;
    replyRate: string;
    byTrade: Array<{ trade: string; sent: number; replies: number }>;
    winners: Array<{ subject: string; trade: string; score: number }>;
    note: string;
  };
  queue: Awaited<ReturnType<typeof queueDepth>>;
  recent: Array<{ action: string; detail: string; at: string }>;
};

export async function loadOutreachState(): Promise<OutreachState> {
  const [stageRows, draftRows, sentRows, actionRows, queue, runway, send] = await Promise.all([
    db()
      .select({ stage: nexusCompanies.stage, count: sql<number>`count(*)` })
      .from(nexusCompanies)
      .groupBy(nexusCompanies.stage),
    db()
      .select({ status: nexusDrafts.status, count: sql<number>`count(*)` })
      .from(nexusDrafts)
      .groupBy(nexusDrafts.status),
    db()
      .select({ draft: nexusDrafts, company: nexusCompanies })
      .from(nexusDrafts)
      .innerJoin(nexusCompanies, eq(nexusCompanies.id, nexusDrafts.companyId))
      .where(isNotNull(nexusDrafts.sentAt))
      .orderBy(desc(nexusDrafts.sentAt))
      .limit(500),
    db().select().from(nexusActions).orderBy(desc(nexusActions.id)).limit(12),
    queueDepth(),
    leadRunway(),
    sendPosture(),
  ]);

  const byStage: Record<string, number> = {};
  let total = 0;
  for (const row of stageRows) {
    byStage[row.stage] = Number(row.count);
    total += Number(row.count);
  }
  const byStatus: Record<string, number> = {};
  for (const row of draftRows) byStatus[row.status] = Number(row.count);

  const replies = sentRows.filter((row) => row.draft.repliedAt).length;
  const signups = sentRows.filter((row) => row.draft.signedUpAt).length;

  const tradeMap = new Map<string, { sent: number; replies: number }>();
  for (const row of sentRows) {
    const key = row.company.trade || "unknown";
    const entry = tradeMap.get(key) || { sent: 0, replies: 0 };
    entry.sent += 1;
    if (row.draft.repliedAt) entry.replies += 1;
    tradeMap.set(key, entry);
  }

  const winners = sentRows
    .filter((row) => isWinner(row.draft))
    .sort((a, b) => scoreOutcome(b.draft) - scoreOutcome(a.draft))
    .slice(0, 5)
    .map((row) => ({
      subject: row.draft.subject,
      trade: row.company.trade,
      score: scoreOutcome(row.draft),
    }));

  const note = !sentRows.length
    ? "Nothing sent yet, so there is nothing to learn from. Drafts are written from rules alone."
    : replies === 0
      ? `${sentRows.length} sent, no replies yet. Too early to draw conclusions; keep the volume small.`
      : `${replies} reply/replies on ${sentRows.length} sends. Winners are fed into new drafts, same trade first.`;

  return {
    pipeline: { total, byStage, runway },
    drafts: {
      pendingReview: byStatus.pending_review || 0,
      approved: byStatus.approved || 0,
      rejected: byStatus.rejected || 0,
      sent: byStatus.sent || 0,
      reviewFloor: reviewFloor(),
    },
    send,
    learning: {
      sent: sentRows.length,
      replies,
      signups,
      replyRate: sentRows.length ? `${((replies / sentRows.length) * 100).toFixed(1)}%` : "n/a",
      byTrade: [...tradeMap.entries()]
        .map(([trade, stats]) => ({ trade, ...stats }))
        .sort((a, b) => b.sent - a.sent)
        .slice(0, 8),
      winners,
      note,
    },
    queue,
    recent: actionRows.map((row) => ({
      action: row.action,
      detail: row.detail,
      at: row.createdAt,
    })),
  };
}

/** Recording a reply or a signup is what teaches Nova anything. */
export async function recordDraftOutcome(
  email: string,
  kind: "replied" | "demo" | "signup" | "bounced" | "complained",
): Promise<boolean> {
  const column = {
    replied: nexusDrafts.repliedAt,
    demo: nexusDrafts.openedDemoAt,
    signup: nexusDrafts.signedUpAt,
    bounced: nexusDrafts.bouncedAt,
    complained: nexusDrafts.complainedAt,
  }[kind];

  const [row] = await db()
    .select({ id: nexusDrafts.id })
    .from(nexusDrafts)
    .where(eq(nexusDrafts.toEmail, email.trim().toLowerCase()))
    .orderBy(desc(nexusDrafts.sentAt))
    .limit(1);
  if (!row) return false;

  const stamp = new Date().toISOString();
  await db()
    .update(nexusDrafts)
    .set({ [column.name]: stamp, updatedAt: stamp } as Record<string, string>)
    .where(eq(nexusDrafts.id, row.id));
  return true;
}

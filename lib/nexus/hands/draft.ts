/**
 * The Draft and Review hands.
 *
 * Ported from RideBy's hands/outreach.ts, which drafts with a model and then
 * has a second model score the draft before it may be queued. Both stay. The
 * order matters: deterministic rules run first, and only a draft that survives
 * them gets spent on a review call.
 *
 * Drafting never sends. That separation is from the original and it is the
 * reason a bad batch cannot become a bad send.
 */

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, nowISO } from "../../db";
import { nexusCompanies, nexusContacts, nexusDrafts } from "../../schema";
import {
  assembleBody,
  draftSystemPrompt,
  draftUserPrompt,
  readyToDraft,
  validateDraft,
  type Draft,
  type Prospect,
} from "../copy";
import { enqueueJob, logAction } from "../jobs";
import { isWinner, reviewFloor } from "../policy";

const API = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";

/** Cheap model for drafting; the copy quality comes from the rails, not the size. */
export function draftModel(): string {
  return process.env.NEXUS_DRAFT_MODEL?.trim() || "gpt-4o-mini";
}

export function isDraftingConfigured(): boolean {
  return (process.env.OPENAI_API_KEY || process.env.NOVA_OPENAI_API_KEY || "").trim().startsWith("sk-");
}

function apiKey(): string {
  const key = (process.env.NEXUS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  if (!key.startsWith("sk-")) throw new Error("No OpenAI key for the outreach hands.");
  return key;
}

async function completeJson(system: string, user: string, model: string): Promise<string> {
  const response = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // Low, but not zero: identical inputs should not yield identical mail
      // across a whole list.
      temperature: 0.6,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) throw new Error(payload.error?.message || `Model returned ${response.status}.`);
  return payload.choices?.[0]?.message?.content || "";
}

/** Past winners, same trade first, fed back in as examples. */
async function winnersFor(trade: string, limit = 3) {
  const rows = await db()
    .select({ draft: nexusDrafts, company: nexusCompanies })
    .from(nexusDrafts)
    .innerJoin(nexusCompanies, eq(nexusCompanies.id, nexusDrafts.companyId))
    .where(isNotNull(nexusDrafts.sentAt))
    .orderBy(desc(nexusDrafts.sentAt))
    .limit(200);
  return rows
    .filter((row) => isWinner(row.draft))
    .sort((a, b) => {
      const aSame = a.company.trade === trade ? 0 : 1;
      const bSame = b.company.trade === trade ? 0 : 1;
      return aSame - bSame;
    })
    .slice(0, limit)
    .map((row) => ({
      subject: row.draft.subject,
      body: row.draft.body,
      trade: row.company.trade,
      fact: row.company.fact,
    }));
}

export type DraftResult = {
  draftId: number | null;
  subject: string;
  attempts: number;
  problems: string[];
};

export async function runOutreachDraft(companyId: number): Promise<DraftResult> {
  const [company] = await db()
    .select()
    .from(nexusCompanies)
    .where(eq(nexusCompanies.id, companyId));
  if (!company) throw new Error(`No company ${companyId}.`);

  const [contact] = await db()
    .select()
    .from(nexusContacts)
    .where(eq(nexusContacts.companyId, companyId))
    .orderBy(desc(nexusContacts.confidence))
    .limit(1);
  if (!contact) throw new Error(`No contact for ${company.name}.`);

  const prospect: Prospect = {
    company: company.name,
    contact: contact.name,
    trade: company.trade,
    city: company.city,
    fact: company.fact,
  };
  const blockers = readyToDraft(prospect);
  if (blockers.length) {
    return { draftId: null, subject: "", attempts: 0, problems: blockers };
  }

  const winners = await winnersFor(company.trade);
  const system = draftSystemPrompt(prospect);
  let user = draftUserPrompt(prospect, winners);
  const model = draftModel();
  let draft: Draft = { subject: "", body: "" };
  let problems: string[] = [];

  // Rejections go back to the model with the exact fault. Two failures usually
  // means the fact is too thin, not that the prompt needs more adjectives.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const raw = await completeJson(system, user, model);
    try {
      const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
      draft = {
        subject: String(parsed.subject || "").trim(),
        body: String(parsed.body || "").trim(),
      };
    } catch {
      problems = ["Model did not return JSON."];
      continue;
    }
    problems = validateDraft(draft, prospect);
    if (!problems.length) break;
    user = [
      draftUserPrompt(prospect, winners),
      "",
      "Your last attempt was rejected:",
      `subject: ${draft.subject}`,
      draft.body,
      "",
      "Fix exactly these problems and change nothing else:",
      ...problems.map((problem) => `- ${problem}`),
    ].join("\n");
  }

  if (problems.length) {
    await logAction({
      action: "outreach.draft.rejected",
      entityType: "company",
      entityId: companyId,
      detail: `${company.name}: ${problems[0]}`,
    });
    return { draftId: null, subject: draft.subject, attempts: 3, problems };
  }

  const stamp = nowISO();
  const [row] = await db()
    .insert(nexusDrafts)
    .values({
      companyId,
      contactId: contact.id,
      toEmail: contact.email,
      subject: draft.subject,
      body: draft.body,
      model,
      status: "pending_review",
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning({ id: nexusDrafts.id });

  await db()
    .update(nexusCompanies)
    .set({ stage: "queued", updatedAt: stamp })
    .where(eq(nexusCompanies.id, companyId));
  await logAction({
    action: "outreach.draft",
    entityType: "company",
    entityId: companyId,
    detail: `${company.name}: "${draft.subject}"`,
  });
  if (row) {
    await enqueueJob("outreach.review", { draftId: row.id }, { dedupeKey: `review:${row.id}` });
  }
  return { draftId: row?.id ?? null, subject: draft.subject, attempts: 1, problems: [] };
}

const REVIEW_SYSTEM = [
  "You grade one cold email that sells shop software to the owner of a small",
  "local trade business. You are the last check before it is sent to a stranger.",
  "",
  "Score 0-100 on whether this specific owner would read it and click, judging:",
  "- does it open with something true and specific about THEIR shop, not a category",
  "- would a busy tradesperson read it in five seconds",
  "- does it sound like a person, not a marketing department",
  "- is the ask small and clear",
  "- would it annoy them enough to hit spam",
  "",
  "Be harsh. 75 is the bar to send. Generic, padded, or salesy copy scores under 50.",
  'Reply JSON only: {"score": 0-100, "reason": "one short sentence", "fix": "one short suggestion"}',
].join("\n");

export type ReviewResult = {
  score: number;
  reason: string;
  approved: boolean;
};

/**
 * Second opinion from a model, kept from RideBy. The deterministic validator
 * already ran, so this is judging persuasion rather than policing format.
 */
export async function runOutreachReview(draftId: number): Promise<ReviewResult> {
  const [row] = await db()
    .select({ draft: nexusDrafts, company: nexusCompanies })
    .from(nexusDrafts)
    .innerJoin(nexusCompanies, eq(nexusCompanies.id, nexusDrafts.companyId))
    .where(eq(nexusDrafts.id, draftId));
  if (!row) throw new Error(`No draft ${draftId}.`);

  const raw = await completeJson(
    REVIEW_SYSTEM,
    [
      `shop: ${row.company.name} (${row.company.trade || "trade"}, ${row.company.city || "unknown city"})`,
      `the fact we researched: ${row.company.fact}`,
      "",
      `subject: ${row.draft.subject}`,
      row.draft.body,
    ].join("\n"),
    process.env.NEXUS_REVIEW_MODEL?.trim() || "gpt-4o-mini",
  );

  let score = 0;
  let reason = "";
  try {
    const parsed = JSON.parse(raw) as { score?: unknown; reason?: unknown };
    score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    reason = String(parsed.reason || "").slice(0, 200);
  } catch {
    score = 0;
    reason = "Reviewer did not return JSON.";
  }

  const floor = reviewFloor();
  const approved = score >= floor;
  const stamp = nowISO();
  await db()
    .update(nexusDrafts)
    .set({
      confidence: score,
      status: approved ? "approved" : "rejected",
      rejectionReason: approved ? "" : reason,
      reviewedAt: stamp,
      updatedAt: stamp,
    })
    .where(eq(nexusDrafts.id, draftId));

  await logAction({
    action: approved ? "outreach.review.approved" : "outreach.review.rejected",
    entityType: "draft",
    entityId: draftId,
    detail: `${row.company.name}: ${score}/100. ${reason}`,
  });

  if (!approved) {
    // Send the company back for a fresh angle rather than burning the lead.
    await db()
      .update(nexusCompanies)
      .set({ stage: "ready", updatedAt: stamp })
      .where(eq(nexusCompanies.id, row.company.id));
  }
  return { score, reason, approved };
}

/** Queues drafts for researched companies that do not have one yet. */
export async function queueDrafts(limit: number): Promise<number> {
  const rows = await db()
    .select({ id: nexusCompanies.id })
    .from(nexusCompanies)
    .where(and(eq(nexusCompanies.stage, "ready")))
    .limit(limit);
  let queued = 0;
  for (const row of rows) {
    const id = await enqueueJob(
      "outreach.draft",
      { companyId: row.id },
      { dedupeKey: `draft:${row.id}` },
    );
    if (id) queued += 1;
  }
  return queued;
}

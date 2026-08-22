/**
 * The Send hand. The only thing here that actually puts mail in a stranger's
 * inbox, and the most guarded file in the pipeline.
 *
 * Ported from RideBy's hands/send.ts, with one guard it did not have and needs:
 * cold mail may not share a sending domain or a provider account with the mail
 * the product itself sends. Sere emails invoices from shop domains; RideBy
 * emails violation notices. Spam complaints from strangers must never land on
 * the reputation that delivers those.
 */

import { desc, eq, isNotNull } from "drizzle-orm";
import { db, nowISO } from "../../db";
import { nexusCompanies, nexusDrafts } from "../../schema";
import { assembleBody, sendableProblems } from "../copy";
import { logAction } from "../jobs";
import { circuitBreaker, isSendEnabled, planSends, type SentOutcome } from "../policy";

export type Sender = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export function senderFromEnv(): Sender | null {
  const apiKey = (process.env.NEXUS_RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.NEXUS_EMAIL_FROM || "").trim();
  if (!apiKey || !fromEmail) return null;
  return {
    apiKey,
    fromEmail,
    fromName: (process.env.NEXUS_EMAIL_FROM_NAME || "").trim(),
    replyTo: (process.env.NEXUS_REPLY_TO || "").trim(),
  };
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).trim().toLowerCase();
}

/** Registrable domain, so mail.sere.cash and sere.cash count as one reputation. */
export function rootDomain(address: string): string {
  const parts = domainOf(address).split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/**
 * Everything that must be true before a single cold email goes out. Returns a
 * list rather than throwing, so Nova can report all of it at once.
 */
export function senderProblems(
  sender: Sender | null,
  transactional: { apiKey: string; fromEmail: string },
): string[] {
  if (!sender) {
    return [
      "Outreach sending is not configured. Set NEXUS_RESEND_API_KEY and NEXUS_EMAIL_FROM " +
        "to a domain used only for cold mail, never the domain that sends invoices.",
    ];
  }
  const problems: string[] = [];
  if (!sender.fromEmail.includes("@")) problems.push("NEXUS_EMAIL_FROM is not an email address.");
  if (transactional.apiKey && sender.apiKey === transactional.apiKey) {
    problems.push(
      "Outreach is using the same provider key as invoice email. A spam complaint would " +
        "hit the account that delivers invoices. Use a separate account.",
    );
  }
  const cold = rootDomain(sender.fromEmail);
  const warm = rootDomain(transactional.fromEmail);
  if (cold && warm && cold === warm) {
    problems.push(
      `Outreach sends from ${cold}, the same domain as invoice email. Cold mail would ` +
        "poison invoice deliverability. Use a separate domain.",
    );
  }
  return problems;
}

export function transactionalFromEnv(): { apiKey: string; fromEmail: string } {
  return {
    apiKey: (process.env.RESEND_API_KEY || "").trim(),
    fromEmail: (process.env.SERE_EMAIL_FROM || "").trim(),
  };
}

/** Everything ever sent, for the caps and the breakers. */
export async function sentHistory(): Promise<SentOutcome[]> {
  const rows = await db()
    .select({
      sentAt: nexusDrafts.sentAt,
      repliedAt: nexusDrafts.repliedAt,
      signedUpAt: nexusDrafts.signedUpAt,
      openedDemoAt: nexusDrafts.openedDemoAt,
      bouncedAt: nexusDrafts.bouncedAt,
      complainedAt: nexusDrafts.complainedAt,
    })
    .from(nexusDrafts)
    .where(isNotNull(nexusDrafts.sentAt))
    .orderBy(desc(nexusDrafts.sentAt))
    .limit(1000);
  return rows;
}

export type SendResult = { sent: boolean; error?: string; providerId?: string };

/**
 * One email. No loop on purpose. Pacing belongs to the runner, so nothing in
 * the codebase is able to blast a list in a single call.
 */
export async function runOutreachSend(draftId: number): Promise<SendResult> {
  const sender = senderFromEnv();
  const configProblems = senderProblems(sender, transactionalFromEnv());
  if (configProblems.length || !sender) {
    return { sent: false, error: configProblems.join(" ") };
  }
  if (!isSendEnabled()) {
    return { sent: false, error: "NEXUS_SEND_ENABLED is not true. Nothing transmits." };
  }

  const breaker = circuitBreaker(await sentHistory());
  if (breaker.tripped) return { sent: false, error: breaker.reasons.join(" ") };

  const [row] = await db()
    .select({ draft: nexusDrafts, company: nexusCompanies })
    .from(nexusDrafts)
    .innerJoin(nexusCompanies, eq(nexusCompanies.id, nexusDrafts.companyId))
    .where(eq(nexusDrafts.id, draftId));
  if (!row) return { sent: false, error: `No draft ${draftId}.` };
  if (row.draft.sentAt) return { sent: false, error: "Already sent." };
  if (row.draft.status !== "approved") {
    return { sent: false, error: `Draft is ${row.draft.status}, not approved.` };
  }

  const body = assembleBody({ subject: row.draft.subject, body: row.draft.body });
  const compliance = sendableProblems(body);
  if (compliance.length) return { sent: false, error: compliance.join(" ") };

  const from = sender.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender.fromEmail;
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${sender.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [row.draft.toEmail],
        subject: row.draft.subject,
        text: body,
        reply_to: sender.replyTo || undefined,
        headers: {
          // Lets a recipient's client offer one-click unsubscribe, which keeps
          // irritated people away from the spam button.
          "List-Unsubscribe": `<mailto:${sender.replyTo || sender.fromEmail}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return { sent: false, error: `Could not reach the email provider: ${(error as Error).message}` };
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) {
    return { sent: false, error: payload.message || `Provider returned ${response.status}.` };
  }

  const stamp = nowISO();
  await db()
    .update(nexusDrafts)
    .set({ status: "sent", sentAt: stamp, providerId: payload.id || "", updatedAt: stamp })
    .where(eq(nexusDrafts.id, draftId));
  await db()
    .update(nexusCompanies)
    .set({ stage: "contacted", updatedAt: stamp })
    .where(eq(nexusCompanies.id, row.company.id));
  await logAction({
    action: "outreach.send",
    entityType: "draft",
    entityId: draftId,
    detail: `${row.company.name} <${row.draft.toEmail}>: "${row.draft.subject}"`,
  });
  return { sent: true, providerId: payload.id || "" };
}

/** Approved drafts waiting, oldest first. */
export async function approvedDrafts(limit: number): Promise<Array<{ id: number; to: string }>> {
  const rows = await db()
    .select({ id: nexusDrafts.id, to: nexusDrafts.toEmail })
    .from(nexusDrafts)
    .where(eq(nexusDrafts.status, "approved"))
    .limit(limit);
  return rows;
}

/** What the send side looks like right now, for Nova to report honestly. */
export async function sendPosture(now = new Date()) {
  const history = await sentHistory();
  const plan = planSends(history, { now });
  const sender = senderFromEnv();
  return {
    enabled: isSendEnabled(),
    configured: Boolean(sender) && senderProblems(sender, transactionalFromEnv()).length === 0,
    problems: senderProblems(sender, transactionalFromEnv()),
    from: sender?.fromEmail || "(unset)",
    day: plan.window.day,
    dailyCap: plan.window.dailyCap,
    sentToday: plan.window.sentToday,
    clearToSend: plan.send,
    blocked: plan.blocked,
    breaker: plan.breaker,
    totalSent: history.length,
    replies: history.filter((row) => row.repliedAt).length,
    signups: history.filter((row) => row.signedUpAt).length,
    complaints: history.filter((row) => row.complainedAt).length,
  };
}

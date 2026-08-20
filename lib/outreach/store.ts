/**
 * Queries over the outreach database. Plain SQL against libSQL — this module
 * stays free of the app's ORM so it lifts into another product cleanly.
 */

import { ensureOutreachSchema, nowISO, outreachClient } from "./db";
import type { Draft, OutreachEmail, Prospect, SentEmail } from "./types";

type Row = Record<string, unknown>;

function text(row: Row, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value);
}

function nullableText(row: Row, key: string): string | null {
  const value = row[key];
  return value == null || value === "" ? null : String(value);
}

function toProspect(row: Row): Prospect {
  return {
    id: Number(row.id),
    company: text(row, "company"),
    contact: text(row, "contact"),
    email: text(row, "email"),
    trade: text(row, "trade"),
    city: text(row, "city"),
    website: text(row, "website"),
    fact: text(row, "fact"),
    source: text(row, "source"),
    unsubscribedAt: nullableText(row, "unsubscribed_at"),
    createdAt: text(row, "created_at"),
  };
}

function toEmail(row: Row): OutreachEmail {
  return {
    id: Number(row.id),
    prospectId: Number(row.prospect_id),
    product: text(row, "product"),
    variant: text(row, "variant"),
    subject: text(row, "subject"),
    body: text(row, "body"),
    approvedAt: nullableText(row, "approved_at"),
    providerId: text(row, "provider_id"),
    sentAt: nullableText(row, "sent_at"),
    openedDemoAt: nullableText(row, "opened_demo_at"),
    repliedAt: nullableText(row, "replied_at"),
    signedUpAt: nullableText(row, "signed_up_at"),
    bouncedAt: nullableText(row, "bounced_at"),
    complainedAt: nullableText(row, "complained_at"),
    createdAt: text(row, "created_at"),
  };
}

export async function initOutreach(): Promise<void> {
  await ensureOutreachSchema();
}

export type ProspectInput = {
  company: string;
  contact?: string;
  email: string;
  trade?: string;
  city?: string;
  website?: string;
  fact?: string;
  source?: string;
};

/** Upserts on email so re-importing a list never duplicates or loses a fact. */
export async function addProspect(input: ProspectInput): Promise<"added" | "updated"> {
  const email = input.email.trim().toLowerCase();
  const existing = await outreachClient().execute({
    sql: "SELECT id FROM prospects WHERE email = ?",
    args: [email],
  });
  if (existing.rows.length) {
    await outreachClient().execute({
      sql: `UPDATE prospects SET company = ?, contact = ?, trade = ?, city = ?,
              website = ?, fact = CASE WHEN ? <> '' THEN ? ELSE fact END,
              source = ?
            WHERE email = ?`,
      args: [
        input.company.trim(),
        (input.contact || "").trim(),
        (input.trade || "").trim(),
        (input.city || "").trim(),
        (input.website || "").trim(),
        (input.fact || "").trim(),
        (input.fact || "").trim(),
        (input.source || "").trim(),
        email,
      ],
    });
    return "updated";
  }
  await outreachClient().execute({
    sql: `INSERT INTO prospects
            (company, contact, email, trade, city, website, fact, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.company.trim(),
      (input.contact || "").trim(),
      email,
      (input.trade || "").trim(),
      (input.city || "").trim(),
      (input.website || "").trim(),
      (input.fact || "").trim(),
      (input.source || "").trim(),
      nowISO(),
    ],
  });
  return "added";
}

export async function listProspects(): Promise<Prospect[]> {
  const result = await outreachClient().execute(
    "SELECT * FROM prospects ORDER BY id",
  );
  return result.rows.map((row) => toProspect(row as Row));
}

/** Never emailed, never opted out. The queue for the next batch. */
export async function untouchedProspects(limit: number): Promise<Prospect[]> {
  const result = await outreachClient().execute({
    sql: `SELECT p.* FROM prospects p
          WHERE p.unsubscribed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.prospect_id = p.id)
          ORDER BY p.id
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => toProspect(row as Row));
}

export async function prospectByEmail(email: string): Promise<Prospect | null> {
  const result = await outreachClient().execute({
    sql: "SELECT * FROM prospects WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });
  const row = result.rows[0];
  return row ? toProspect(row as Row) : null;
}

export async function unsubscribe(email: string): Promise<boolean> {
  const result = await outreachClient().execute({
    sql: "UPDATE prospects SET unsubscribed_at = ? WHERE email = ? AND unsubscribed_at IS NULL",
    args: [nowISO(), email.trim().toLowerCase()],
  });
  return result.rowsAffected > 0;
}

export async function saveDraft(
  prospectId: number,
  product: string,
  variant: string,
  draft: Draft,
): Promise<number> {
  const result = await outreachClient().execute({
    sql: `INSERT INTO emails (prospect_id, product, variant, subject, body, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [prospectId, product, variant, draft.subject, draft.body, nowISO()],
  });
  return Number(result.lastInsertRowid);
}

/** Drafted, not sent. Nothing leaves without a person approving it. */
export async function pendingDrafts(): Promise<Array<{ email: OutreachEmail; prospect: Prospect }>> {
  const result = await outreachClient().execute(
    `SELECT e.*, p.company, p.contact, p.email AS prospect_email, p.trade, p.city,
            p.website, p.fact, p.source, p.unsubscribed_at, p.created_at AS prospect_created
     FROM emails e
     JOIN prospects p ON p.id = e.prospect_id
     WHERE e.sent_at IS NULL
     ORDER BY e.id`,
  );
  return result.rows.map((raw) => {
    const row = raw as Row;
    return {
      email: toEmail(row),
      prospect: {
        id: Number(row.prospect_id),
        company: text(row, "company"),
        contact: text(row, "contact"),
        email: text(row, "prospect_email"),
        trade: text(row, "trade"),
        city: text(row, "city"),
        website: text(row, "website"),
        fact: text(row, "fact"),
        source: text(row, "source"),
        unsubscribedAt: nullableText(row, "unsubscribed_at"),
        createdAt: text(row, "prospect_created"),
      },
    };
  });
}

export async function approveDraft(emailId: number): Promise<void> {
  await outreachClient().execute({
    sql: "UPDATE emails SET approved_at = ? WHERE id = ? AND approved_at IS NULL",
    args: [nowISO(), emailId],
  });
}

export async function discardDraft(emailId: number): Promise<void> {
  await outreachClient().execute({
    sql: "DELETE FROM emails WHERE id = ? AND sent_at IS NULL",
    args: [emailId],
  });
}

export async function markSent(emailId: number, providerId: string): Promise<void> {
  await outreachClient().execute({
    sql: "UPDATE emails SET sent_at = ?, provider_id = ? WHERE id = ?",
    args: [nowISO(), providerId, emailId],
  });
}

export type OutcomeKind = "replied" | "demo" | "signup" | "bounced" | "complained";

const OUTCOME_COLUMNS: Record<OutcomeKind, string> = {
  replied: "replied_at",
  demo: "opened_demo_at",
  signup: "signed_up_at",
  bounced: "bounced_at",
  complained: "complained_at",
};

/**
 * Recording the outcome is the whole point. A campaign with no outcomes
 * recorded teaches Nova nothing, so this is the one command to keep up with.
 */
export async function recordOutcome(email: string, kind: OutcomeKind): Promise<boolean> {
  const prospect = await prospectByEmail(email);
  if (!prospect) return false;
  const latest = await outreachClient().execute({
    sql: `SELECT id FROM emails WHERE prospect_id = ? AND sent_at IS NOT NULL
          ORDER BY sent_at DESC LIMIT 1`,
    args: [prospect.id],
  });
  const row = latest.rows[0];
  if (!row) return false;
  await outreachClient().execute({
    sql: `UPDATE emails SET ${OUTCOME_COLUMNS[kind]} = ? WHERE id = ?`,
    args: [nowISO(), Number((row as Row).id)],
  });
  if (kind === "complained") await unsubscribe(email);
  return true;
}

/** Everything sent, with its prospect, for scoring and retrieval. */
export async function sentHistory(): Promise<SentEmail[]> {
  const result = await outreachClient().execute(
    `SELECT e.*, p.trade, p.city, p.fact
     FROM emails e
     JOIN prospects p ON p.id = e.prospect_id
     WHERE e.sent_at IS NOT NULL
     ORDER BY e.sent_at DESC`,
  );
  return result.rows.map((raw) => {
    const row = raw as Row;
    return {
      ...toEmail(row),
      trade: text(row, "trade"),
      city: text(row, "city"),
      fact: text(row, "fact"),
    };
  });
}

/**
 * Nova's drafting call.
 *
 * Self-contained on purpose: this module talks to the API directly instead of
 * importing Sere's assistant plumbing, so the whole outreach folder can be
 * copied into another product without dragging a shop OS along with it.
 *
 * gpt-4o-mini is fine here. The quality comes from a researched fact, examples
 * that actually earned replies, and a validator that rejects slop — not from a
 * bigger model.
 */

import {
  buildSystemPrompt,
  buildUserPrompt,
  prospectReady,
  validateDraft,
  type Product,
} from "./copy";
import type { Draft, Prospect, SentEmail } from "./types";

const API = process.env.OUTREACH_OPENAI_BASE || "https://api.openai.com/v1";

export const DEFAULT_MODEL = "gpt-4o-mini";

export class NovaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NovaError";
  }
}

export type NovaCredentials = {
  apiKey: string;
  model: string;
};

/**
 * Prefers an outreach-specific key so marketing spend is separable from the
 * key that answers questions inside the app.
 */
export function novaCredentials(): NovaCredentials | null {
  const apiKey = (process.env.OUTREACH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey.startsWith("sk-")) return null;
  const model = (process.env.OUTREACH_MODEL || "").trim() || DEFAULT_MODEL;
  return { apiKey, model };
}

export type DraftResult = {
  draft: Draft;
  attempts: number;
  /** Problems on the last attempt. Non-empty means it never came out clean. */
  problems: string[];
  winnersUsed: number;
};

/**
 * Drafts, checks, and on failure tells the model exactly what it broke and
 * tries again. Two bad attempts is a signal the fact is too thin, not that the
 * prompt needs more adjectives.
 */
export async function draftEmail(
  credentials: NovaCredentials,
  product: Product,
  prospect: Prospect,
  winners: SentEmail[],
  maxAttempts = 3,
): Promise<DraftResult> {
  const blockers = prospectReady(prospect);
  if (blockers.length) throw new NovaError(blockers.join(" "));

  const system = buildSystemPrompt(product);
  let user = buildUserPrompt(prospect, winners);
  let last: Draft = { subject: "", body: "" };
  let problems: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await complete(credentials, system, user);
    problems = validateDraft(last, prospect);
    if (!problems.length) {
      return { draft: last, attempts: attempt, problems: [], winnersUsed: winners.length };
    }
    user = [
      buildUserPrompt(prospect, winners),
      "",
      "Your last attempt was rejected:",
      `subject: ${last.subject}`,
      last.body,
      "",
      "Fix exactly these problems and keep everything else:",
      ...problems.map((problem) => `- ${problem}`),
    ].join("\n");
  }

  return { draft: last, attempts: maxAttempts, problems, winnersUsed: winners.length };
}

async function complete(
  credentials: NovaCredentials,
  system: string,
  user: string,
): Promise<Draft> {
  let response: Response;
  try {
    response = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: credentials.model,
        // Low, but not zero: identical inputs should not produce identical mail
        // across a whole list.
        temperature: 0.6,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new NovaError(`Could not reach the model: ${(error as Error).message}`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!response.ok) {
    throw new NovaError(payload.error?.message || `Model returned ${response.status}.`);
  }
  const content = payload.choices?.[0]?.message?.content || "";
  let parsed: { subject?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new NovaError("Model did not return JSON.");
  }
  return {
    subject: String(parsed.subject || "").trim(),
    body: String(parsed.body || "").trim(),
  };
}

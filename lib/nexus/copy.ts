/**
 * What Nova is allowed to say, and how a draft gets rejected.
 *
 * RideBy scores drafts with an AI reviewer and auto-approves at 75. That stays
 * (see hands/review.ts), but a model judging a model can be talked into
 * approving filler, so deterministic rules run first and cannot be argued with.
 *
 * The core rule: Nova phrases one researched fact about the shop. She is never
 * asked to be interesting about a business she knows nothing about, because
 * that is exactly when a language model produces "I hope this finds you well."
 *
 * Pure. No network, no database.
 */

import { tradeCopy } from "../business";

export const MAX_WORDS = 90;
export const MAX_SUBJECT_CHARS = 60;

export const BANNED_PHRASES = [
  "i hope this email finds you well",
  "i hope this finds you well",
  "hope you're doing well",
  "i wanted to reach out",
  "just wanted to reach out",
  "reaching out because",
  "in today's fast-paced",
  "in the ever-evolving",
  "game changer",
  "revolutionize",
  "revolutionary",
  "cutting-edge",
  "best-in-class",
  "synergy",
  "leverage our",
  "circle back",
  "touch base",
  "as a fellow",
  "i came across your website",
  "i noticed you're in the",
  "15 minutes of your time",
  "picking your brain",
  "elevate your business",
  "take your business to the next level",
  "supercharge",
  "seamless",
  "robust solution",
  "state-of-the-art",
  "unlock your",
];

export function ctaUrl(): string {
  return process.env.NEXUS_CTA_URL?.trim() || "https://sere.cash/demo";
}

export function senderName(): string {
  return process.env.NEXUS_SENDER_NAME?.trim() || "Isaac";
}

export function postalAddress(): string {
  return process.env.NEXUS_POSTAL_ADDRESS?.trim() || "";
}

export const UNSUBSCRIBE_LINE = "Reply STOP and I will not email you again.";

export type Prospect = {
  company: string;
  contact: string;
  trade: string;
  city: string;
  fact: string;
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * A company with no researched fact is not ready to email. Enforcing that here
 * is the whole difference between real personalization and generated filler.
 */
export function readyToDraft(prospect: Prospect): string[] {
  const problems: string[] = [];
  if (!prospect.company.trim()) problems.push("No company name.");
  if (countWords(prospect.fact) < 3) {
    problems.push("No specific fact about this shop. Research it first or drop it.");
  }
  return problems;
}

/** The instruction set. Narrow on purpose: Nova phrases, she does not invent. */
export function draftSystemPrompt(prospect: Prospect): string {
  const voice = tradeCopy(prospect.trade);
  const unit = voice.job.toLowerCase();
  const work = voice.jobs.toLowerCase();
  return [
    "You write one short cold email selling Sere to the owner of a local shop.",
    `Sere is the office book for a ${voice.name.toLowerCase()} shop: ${work} and invoices in one place,`,
    "and what actually landed in the bank next to what was invoiced, on the owner's phone.",
    `The only ask: open a real working shop with sample ${work} already in it. One tap, no account.`,
    "",
    "Rules, all hard:",
    `- Under ${MAX_WORDS} words in the body. Shorter is better.`,
    "- Open with the specific fact you are given about this shop, in your own words.",
    "- Never invent a second fact, a number, a name, a price, or a compliment.",
    `- Their words: the work is ${work}, one of them is a ${unit}.`,
    "- Plain trade English. Short sentences. No marketing words.",
    "- No greeting cliches. Never say you hope they are well, that you are reaching out,",
    "  or that you came across their website.",
    "- Do not ask for a call or a meeting. Make the one ask above.",
    "- One question maximum, at the end.",
    `- Subject: under ${MAX_SUBJECT_CHARS} characters, lowercase, no emoji, no exclamation mark,`,
    "  like a person typed it on a phone.",
    "- If the fact is thin, write a shorter email. Do not pad.",
    "",
    'Reply with JSON only: {"subject": "...", "body": "..."}',
    "No signature, no address, no unsubscribe line. Those are appended after you.",
  ].join("\n");
}

/** Winners go in as examples so a reply today shapes tomorrow's draft. */
export function draftUserPrompt(
  prospect: Prospect,
  winners: Array<{ subject: string; body: string; trade: string; fact: string }>,
): string {
  const parts: string[] = [];
  if (winners.length) {
    parts.push("These earlier emails got replies. Match their voice and length, not their facts:");
    for (const winner of winners) {
      parts.push(
        [
          `--- worked on a ${winner.trade || "shop"}`,
          `fact used: ${winner.fact || "(none recorded)"}`,
          `subject: ${winner.subject}`,
          winner.body.trim(),
        ].join("\n"),
      );
    }
    parts.push("");
  }
  parts.push("Write the email for this shop:");
  parts.push(
    [
      `company: ${prospect.company}`,
      prospect.contact ? `contact first name: ${firstName(prospect.contact)}` : "",
      prospect.trade ? `trade: ${prospect.trade}` : "",
      prospect.city ? `city: ${prospect.city}` : "",
      `the one fact you may use: ${prospect.fact}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return parts.join("\n");
}

export type Draft = { subject: string; body: string };

/**
 * Runs before the AI reviewer and before a human. Deterministic, so the same
 * slop is rejected the same way every time.
 */
export function validateDraft(draft: Draft, prospect: Prospect): string[] {
  const problems: string[] = [];
  const subject = draft.subject.trim();
  const body = draft.body.trim();

  if (!subject) problems.push("Empty subject.");
  if (subject.length > MAX_SUBJECT_CHARS) {
    problems.push(`Subject is ${subject.length} characters, over ${MAX_SUBJECT_CHARS}.`);
  }
  if (subject.includes("!")) problems.push("Subject has an exclamation mark.");
  if (/\p{Extended_Pictographic}/u.test(`${subject}${body}`)) problems.push("Emoji in the email.");

  if (!body) problems.push("Empty body.");
  const words = countWords(body);
  if (words > MAX_WORDS) problems.push(`Body is ${words} words, over ${MAX_WORDS}.`);

  const haystack = `${subject}\n${body}`.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (haystack.includes(phrase)) problems.push(`Bulk-email phrase: "${phrase}".`);
  }

  const questions = (body.match(/\?/g) || []).length;
  if (questions > 1) problems.push(`${questions} questions in the body. One at most.`);
  if (/\b(call|meeting|zoom|calendar|calendly)\b/i.test(body)) {
    problems.push("Asks for a call. The ask is the demo link.");
  }
  if (!usesFact(body, prospect.fact)) {
    problems.push("Body does not use the researched fact. It is generic.");
  }
  if (prospect.contact) {
    const wanted = firstName(prospect.contact).toLowerCase();
    const greeted = /\b(hi|hey|hello)\s+([a-z]+)/i.exec(body);
    if (greeted && greeted[2].toLowerCase() !== wanted) {
      problems.push(`Greets "${greeted[2]}" but the contact is "${firstName(prospect.contact)}".`);
    }
  }
  return problems;
}

/** Ignores short and generic words so "the" does not count as personalization. */
function usesFact(body: string, fact: string): boolean {
  const stop = new Set([
    "the", "and", "for", "with", "your", "you", "they", "their", "that", "this",
    "have", "has", "are", "was", "but", "not", "from", "any", "all", "out",
    "shop", "business", "company", "site", "website", "page", "only", "still",
  ]);
  const factWords = new Set(
    fact
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3 && !stop.has(word)),
  );
  if (!factWords.size) return false;
  return body
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((word) => factWords.has(word));
}

/**
 * Signature, opt-out, and postal address are appended in code. CAN-SPAM
 * compliance is not something to leave to a language model's discretion.
 */
export function assembleBody(draft: Draft): string {
  const lines = [draft.body.trim(), "", senderName(), "", `Try it: ${ctaUrl()}`, "", UNSUBSCRIBE_LINE];
  const address = postalAddress();
  if (address) lines.push(address);
  return lines.join("\n");
}

/** Checked on the assembled email, immediately before transmit. */
export function sendableProblems(body: string): string[] {
  const problems: string[] = [];
  if (!body.includes(UNSUBSCRIBE_LINE)) problems.push("No opt-out line. CAN-SPAM requires one.");
  const address = postalAddress();
  if (!address) {
    problems.push(
      "No postal address configured. CAN-SPAM requires a real mailing address on commercial email. Set NEXUS_POSTAL_ADDRESS.",
    );
  } else if (!body.includes(address)) {
    problems.push("Postal address missing from the email.");
  }
  return problems;
}

/**
 * The rules that make a cold email land, expressed as code instead of hope.
 *
 * Two ideas here. First, Nova is never asked to be interesting — it is asked to
 * phrase one true fact we already looked up, so it cannot fake specificity.
 * Second, every draft is checked before a human ever sees it, so the usual
 * model slop never reaches the review queue.
 *
 * Everything in this file is pure so it can be tested without a network.
 */

import type { Draft, Prospect, SentEmail } from "./types";

export const MAX_WORDS = 90;
export const MAX_SUBJECT_CHARS = 60;

/**
 * Phrases that mark an email as bulk. Some are filler, some are the tells of a
 * model writing about a business it knows nothing about.
 */
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
  "quick question for you",
  "as a fellow",
  "i came across your website",
  "i noticed you're in the",
  "let me know if you'd like to hop on a call",
  "15 minutes of your time",
  "picking your brain",
  "delighted",
  "thrilled",
  "elevate your business",
  "take your business to the next level",
  "unlock",
  "supercharge",
  "seamless",
  "robust solution",
  "state-of-the-art",
];

export type Product = {
  key: string;
  name: string;
  /** One sentence, plain, what it does for the person reading. */
  pitch: string;
  /** The single small ask. Never "a call". */
  cta: string;
  ctaUrl: string;
  senderName: string;
  /** CAN-SPAM requires a real postal address on commercial mail. */
  postalAddress: string;
  unsubscribeHint: string;
};

export const SERE: Product = {
  key: "sere",
  name: "Sere",
  pitch:
    "Sere is the office book for a shop like yours: jobs, invoices, and what " +
    "actually landed in the bank, on your phone.",
  cta: "Open a real HVAC shop with sample work in it — no account, one tap.",
  ctaUrl: "https://sere.cash/demo",
  senderName: "Isaac",
  postalAddress: "",
  unsubscribeHint: "Reply STOP and I will not email you again.",
};

/**
 * The instruction set. Deliberately narrow: the model is a phraser, not an
 * author. Everything it is allowed to claim is in the prompt.
 */
export function buildSystemPrompt(product: Product): string {
  return [
    `You write one short cold email for ${product.name}.`,
    `What ${product.name} is: ${product.pitch}`,
    `The only ask: ${product.cta}`,
    "",
    "Rules, all of them hard:",
    `- Under ${MAX_WORDS} words in the body. Shorter is better.`,
    "- Open with the specific fact you are given about this shop, in your own",
    "  words. Never invent a second fact, a number, a name, or a compliment.",
    "- Plain trade English. Short sentences. No marketing words.",
    "- No greeting cliches. Never write that you hope they are well, that you",
    "  are reaching out, or that you came across their website.",
    "- Do not ask for a call or a meeting. Make the one ask above.",
    "- One question maximum, at the end.",
    `- Subject line: under ${MAX_SUBJECT_CHARS} characters, lowercase, no`,
    "  emoji, no exclamation mark, reads like a person typed it on a phone.",
    "- If the fact you are given is thin, write a shorter email. Do not pad.",
    "",
    'Reply with JSON only: {"subject": "...", "body": "..."}',
    "The body must not contain a signature, a postal address, or an",
    "unsubscribe line. Those get appended after you.",
  ].join("\n");
}

/**
 * Winners go in as examples rather than being fine-tuned in, so a new winner
 * changes the next send instead of the next retrain.
 */
export function buildUserPrompt(prospect: Prospect, winners: SentEmail[]): string {
  const parts: string[] = [];
  if (winners.length) {
    parts.push(
      "These earlier emails got replies. Match their voice and length, not " +
        "their facts:",
    );
    for (const winner of winners) {
      parts.push(
        [
          `--- worked on: ${winner.trade || "a shop"}${winner.city ? ` in ${winner.city}` : ""}`,
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

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * A prospect with no fact is not ready to email. Enforcing this at the door is
 * the difference between real personalization and generated filler.
 */
export function prospectReady(prospect: Prospect): string[] {
  const problems: string[] = [];
  if (!prospect.email.includes("@")) problems.push("No usable email address.");
  if (prospect.unsubscribedAt) problems.push("This prospect asked out. Never email again.");
  if (!prospect.company.trim()) problems.push("No company name.");
  if (countWords(prospect.fact) < 3) {
    problems.push(
      "No specific fact about this shop. Research it or drop it — Nova will " +
        "invent filler otherwise.",
    );
  }
  return problems;
}

/**
 * Checked before a human reads the draft, so review time is spent on real
 * candidates instead of rejecting the same slop over and over.
 */
export function validateDraft(draft: Draft, prospect: Prospect): string[] {
  const problems: string[] = [];
  const subject = draft.subject.trim();
  const body = draft.body.trim();

  if (!subject) problems.push("Empty subject.");
  if (subject.length > MAX_SUBJECT_CHARS) {
    problems.push(`Subject is ${subject.length} characters, over ${MAX_SUBJECT_CHARS}.`);
  }
  if (/[!]/.test(subject)) problems.push("Subject has an exclamation mark.");
  if (/\p{Extended_Pictographic}/u.test(`${subject}${body}`)) {
    problems.push("Emoji in the email.");
  }

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

  if (!sharesWord(body, prospect.fact)) {
    problems.push("Body does not use the fact we researched. It is generic.");
  }

  if (prospect.contact) {
    const first = firstName(prospect.contact).toLowerCase();
    const wrongNames = /\b(hi|hey|hello)\s+([a-z]+)/i.exec(body);
    if (wrongNames && wrongNames[2].toLowerCase() !== first) {
      problems.push(`Greets "${wrongNames[2]}" but the contact is "${firstName(prospect.contact)}".`);
    }
  }

  return problems;
}

/**
 * True when the draft actually reuses something concrete from the fact. Short
 * and common words are ignored so "the" does not count as personalization.
 */
function sharesWord(body: string, fact: string): boolean {
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
  const bodyWords = body.toLowerCase().split(/[^a-z0-9]+/);
  return bodyWords.some((word) => factWords.has(word));
}

/**
 * The signature, postal address, and opt-out are appended in code rather than
 * asked of the model, because CAN-SPAM compliance is not something to leave to
 * a language model's discretion.
 */
export function finalBody(draft: Draft, product: Product): string {
  const lines = [draft.body.trim(), "", `— ${product.senderName}`, "", product.unsubscribeHint];
  if (product.postalAddress) lines.push(product.postalAddress);
  return lines.join("\n");
}

/** What a compliant footer must contain, checked on the assembled email. */
export function sendableProblems(body: string, product: Product): string[] {
  const problems: string[] = [];
  if (!body.includes(product.unsubscribeHint)) {
    problems.push("No opt-out line. CAN-SPAM requires one.");
  }
  if (!product.postalAddress) {
    problems.push(
      "No postal address configured. CAN-SPAM requires a real mailing address " +
        "on commercial email. Set OUTREACH_POSTAL_ADDRESS.",
    );
  } else if (!body.includes(product.postalAddress)) {
    problems.push("Postal address missing from the email.");
  }
  return problems;
}

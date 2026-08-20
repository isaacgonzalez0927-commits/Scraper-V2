/**
 * Learning from what actually happened, without fine-tuning.
 *
 * A signup is worth far more than a reply, and a reply is worth far more than
 * a demo open. Complaints are worth less than nothing — an email that drew a
 * spam complaint is a lesson in what not to write, so it can never be held up
 * as an example.
 *
 * Winners are fed back in as examples on the next draft. That adapts the same
 * hour a new winner appears, which a retrain cannot, and it stays readable:
 * you can always see which emails taught Nova what.
 *
 * Pure functions only, so the scoring is testable and the same code drops into
 * another product.
 */

import type { SentEmail } from "./types";

export const SCORE = {
  signedUp: 100,
  replied: 30,
  openedDemo: 8,
  bounced: -5,
  complained: -100,
} as const;

export function scoreEmail(email: SentEmail): number {
  if (!email.sentAt) return 0;
  let score = 0;
  if (email.signedUpAt) score += SCORE.signedUp;
  if (email.repliedAt) score += SCORE.replied;
  if (email.openedDemoAt) score += SCORE.openedDemo;
  if (email.bouncedAt) score += SCORE.bounced;
  if (email.complainedAt) score += SCORE.complained;
  return score;
}

/** An email worth imitating: it worked, and nobody complained about it. */
export function isWinner(email: SentEmail): boolean {
  if (email.complainedAt) return false;
  return scoreEmail(email) >= SCORE.replied;
}

/**
 * Same-trade examples first, because how you talk to a roofer is not how you
 * talk to a salon. Score breaks ties, then recency.
 */
export function pickWinners(
  history: SentEmail[],
  target: { trade: string; city: string },
  limit = 3,
): SentEmail[] {
  const trade = target.trade.trim().toLowerCase();
  const city = target.city.trim().toLowerCase();
  return history
    .filter(isWinner)
    .map((email) => ({
      email,
      sameTrade: trade && email.trade.trim().toLowerCase() === trade ? 1 : 0,
      sameCity: city && email.city.trim().toLowerCase() === city ? 1 : 0,
      score: scoreEmail(email),
    }))
    .sort((a, b) => {
      if (a.sameTrade !== b.sameTrade) return b.sameTrade - a.sameTrade;
      if (a.score !== b.score) return b.score - a.score;
      if (a.sameCity !== b.sameCity) return b.sameCity - a.sameCity;
      return (b.email.sentAt || "").localeCompare(a.email.sentAt || "");
    })
    .slice(0, limit)
    .map((row) => row.email);
}

export type VariantStats = {
  variant: string;
  sent: number;
  replied: number;
  signedUp: number;
  complained: number;
  replyRate: number;
  score: number;
};

/**
 * Per-variant results. The point of holding two subject lines is that this
 * table, not an opinion, decides which one survives.
 */
export function variantStats(history: SentEmail[]): VariantStats[] {
  const groups = new Map<string, SentEmail[]>();
  for (const email of history) {
    if (!email.sentAt) continue;
    const key = email.variant || "a";
    const list = groups.get(key);
    if (list) list.push(email);
    else groups.set(key, [email]);
  }
  return [...groups.entries()]
    .map(([variant, emails]) => {
      const replied = emails.filter((e) => e.repliedAt).length;
      const total = emails.reduce((sum, e) => sum + scoreEmail(e), 0);
      return {
        variant,
        sent: emails.length,
        replied,
        signedUp: emails.filter((e) => e.signedUpAt).length,
        complained: emails.filter((e) => e.complainedAt).length,
        replyRate: emails.length ? replied / emails.length : 0,
        score: total / emails.length,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Which variant to send next. Everything gets a fair sample before the winner
 * takes over, otherwise one lucky early reply decides the whole campaign.
 */
export function nextVariant(history: SentEmail[], variants: string[], minSample = 20): string {
  if (!variants.length) return "a";
  const stats = variantStats(history);
  const sentFor = (variant: string) => stats.find((s) => s.variant === variant)?.sent || 0;
  const starved = variants.find((variant) => sentFor(variant) < minSample);
  if (starved) return starved;
  return stats[0]?.variant || variants[0];
}

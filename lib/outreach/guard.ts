/**
 * The rails that make autonomy survivable.
 *
 * "Send with no human in the loop" and "send as fast as possible" are different
 * things, and only the first one is a good idea. A new domain that bursts a list
 * gets filtered permanently, and a campaign that keeps sending through spam
 * complaints takes the domain down with it.
 *
 * So autonomous mode is allowed, but it runs inside a warmup schedule, a daily
 * cap, and circuit breakers that stop everything when the numbers say the list
 * or the copy is bad. Nothing here asks a human anything; it just refuses to
 * keep going off a cliff.
 *
 * Pure functions, so every threshold is testable without sending mail.
 */

import type { SentEmail } from "./types";

/**
 * Days on a new domain and how many cold emails that day can carry. Mailbox
 * providers judge a sender on trend, not volume, so this ramps instead of
 * jumping. Numbers are conservative on purpose: the cost of going slow is
 * time, and the cost of going fast is the domain.
 */
export const WARMUP: ReadonlyArray<{ throughDay: number; cap: number }> = [
  { throughDay: 3, cap: 20 },
  { throughDay: 7, cap: 40 },
  { throughDay: 14, cap: 75 },
  { throughDay: 21, cap: 120 },
  { throughDay: 30, cap: 200 },
];

export const STEADY_CAP = 300;

export function warmupCap(day: number): number {
  for (const step of WARMUP) {
    if (day <= step.throughDay) return step.cap;
  }
  return STEADY_CAP;
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** 1 on the first day this domain ever sent, so a fresh setup starts slow. */
export function sendingDay(history: SentEmail[], now = new Date()): number {
  const stamps = history.map((email) => email.sentAt || "").filter(Boolean).sort();
  const first = stamps[0];
  if (!first) return 1;
  const start = Date.parse(dayKey(first));
  const today = Date.parse(dayKey(now.toISOString()));
  if (Number.isNaN(start) || Number.isNaN(today)) return 1;
  return Math.floor((today - start) / 86_400_000) + 1;
}

export type SendingWindow = {
  day: number;
  dailyCap: number;
  sentToday: number;
  remaining: number;
};

export function sendingWindow(history: SentEmail[], now = new Date()): SendingWindow {
  const day = sendingDay(history, now);
  const dailyCap = warmupCap(day);
  const today = dayKey(now.toISOString());
  const sentToday = history.filter((email) => email.sentAt && dayKey(email.sentAt) === today).length;
  return { day, dailyCap, sentToday, remaining: Math.max(0, dailyCap - sentToday) };
}

/**
 * Thresholds. Gmail treats a 0.1% complaint rate as the danger line and 0.3% as
 * trouble, so 0.3% is where this stops. At low volume a rate means nothing, so
 * there is also an absolute trigger: two complaints is a pattern, not luck.
 */
export const LIMITS = {
  complaintRate: 0.003,
  complaintRateMinSample: 100,
  absoluteComplaints: 2,
  absoluteComplaintWindow: 500,
  bounceRate: 0.05,
  bounceRateMinSample: 20,
} as const;

export type Breaker = { tripped: boolean; reasons: string[] };

/**
 * Looks at recent sends only, so one bad week early on does not block sending
 * forever once the list and the copy have improved.
 */
export function circuitBreaker(history: SentEmail[]): Breaker {
  const sent = history
    .filter((email) => email.sentAt)
    .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))
    .slice(0, LIMITS.absoluteComplaintWindow);
  const reasons: string[] = [];
  if (!sent.length) return { tripped: false, reasons };

  const complaints = sent.filter((email) => email.complainedAt).length;
  const bounces = sent.filter((email) => email.bouncedAt).length;

  if (complaints >= LIMITS.absoluteComplaints) {
    reasons.push(
      `${complaints} spam complaints in the last ${sent.length} sends. Stop, ` +
        "fix the list or the copy, do not keep sending.",
    );
  } else if (
    sent.length >= LIMITS.complaintRateMinSample &&
    complaints / sent.length > LIMITS.complaintRate
  ) {
    reasons.push(
      `Complaint rate ${(complaints / sent.length * 100).toFixed(2)}% is over ` +
        `${(LIMITS.complaintRate * 100).toFixed(1)}%. Mailbox providers will start filtering.`,
    );
  }

  if (
    sent.length >= LIMITS.bounceRateMinSample &&
    bounces / sent.length > LIMITS.bounceRate
  ) {
    reasons.push(
      `Bounce rate ${(bounces / sent.length * 100).toFixed(1)}% is over ` +
        `${(LIMITS.bounceRate * 100).toFixed(0)}%. The list is stale or scraped badly.`,
    );
  }

  return { tripped: reasons.length > 0, reasons };
}

export type Plan = {
  /** How many to send on this run. Zero means do nothing, and that is fine. */
  send: number;
  window: SendingWindow;
  breaker: Breaker;
  notes: string[];
};

/**
 * The whole decision for one autonomous run, in one place: is anything broken,
 * how much headroom is left today, and how much of that to use now.
 */
export function planRun(
  history: SentEmail[],
  options: { batch?: number; now?: Date } = {},
): Plan {
  const now = options.now || new Date();
  const window = sendingWindow(history, now);
  const breaker = circuitBreaker(history);
  const notes: string[] = [];

  if (breaker.tripped) {
    return { send: 0, window, breaker, notes: ["Circuit breaker is open. Sending nothing."] };
  }
  if (!window.remaining) {
    notes.push(`Day ${window.day} cap of ${window.dailyCap} already used.`);
    return { send: 0, window, breaker, notes };
  }
  const batch = options.batch && options.batch > 0 ? options.batch : window.dailyCap;
  const send = Math.min(batch, window.remaining);
  notes.push(
    `Day ${window.day}: ${window.sentToday}/${window.dailyCap} sent, sending ${send} now.`,
  );
  return { send, window, breaker, notes };
}

/**
 * Seconds between sends. Spreading a batch across the day looks like a person
 * and a burst looks like a blast, so the gap grows when the batch is small
 * relative to the day.
 */
export function pauseSeconds(batch: number): number {
  if (batch <= 1) return 0;
  const spread = Math.round(1800 / batch);
  return Math.min(120, Math.max(20, spread));
}

/**
 * Send rails. These are current settings, not laws of nature. Nova is told to
 * describe them that way and may argue for changing them.
 *
 * Ported from RideBy's outreach-policy.ts (window, jitter, daily cap, kill
 * switch, review floor) with two additions it did not have: a warmup ramp by
 * domain age, and circuit breakers that stop sending when the numbers go bad.
 *
 * A flat 50/day on a brand-new domain is how you get filtered permanently, and
 * a kill switch only helps if someone is watching. Everything here is pure so
 * every threshold is testable without sending mail.
 */

export const OUTREACH_TZ = process.env.NEXUS_TZ?.trim() || "America/New_York";

/** Local hours, weekdays only. Inclusive start, exclusive end. */
export const WINDOW_START_HOUR = 10;
export const WINDOW_END_HOUR = 15;

export const INTERVAL_MIN_MINUTES = 5;
export const INTERVAL_MAX_MINUTES = 15;

/** Master switch. Must be exactly "true". Nothing transmits otherwise. */
export function isSendEnabled(): boolean {
  return (process.env.NEXUS_SEND_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Review confidence a draft needs before it may be queued to send. */
export function reviewFloor(): number {
  const raw = Number(process.env.NEXUS_REVIEW_FLOOR ?? 75);
  if (!Number.isFinite(raw)) return 75;
  return Math.min(100, Math.max(50, Math.floor(raw)));
}

/**
 * Warmup. Mailbox providers judge a new sender on trend, not volume, so this
 * ramps rather than opening at full tilt.
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

/** Hard ceiling on top of warmup, so a bad env value cannot open the floodgates. */
export function maxSendsPerDay(): number {
  const raw = Number(process.env.NEXUS_MAX_SENDS_PER_DAY ?? STEADY_CAP);
  if (!Number.isFinite(raw) || raw < 1) return STEADY_CAP;
  return Math.min(STEADY_CAP, Math.floor(raw));
}

function zoneParts(date: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OUTREACH_TZ,
    hour: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const label = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: hour === 24 ? 0 : hour, weekday: map[label] ?? 1 };
}

export function isWithinWindow(date = new Date()): boolean {
  const { hour, weekday } = zoneParts(date);
  if (weekday === 0 || weekday === 6) return false;
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

/** Randomized gap so a batch reads like a person, not a blast. */
export function nextSendDelaySeconds(random: () => number = Math.random): number {
  const minutes = INTERVAL_MIN_MINUTES + random() * (INTERVAL_MAX_MINUTES - INTERVAL_MIN_MINUTES);
  return Math.max(60, Math.round(minutes * 60));
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Outcome of a sent draft, which is all the breakers need to see. */
export type SentOutcome = {
  sentAt: string | null;
  repliedAt?: string | null;
  signedUpAt?: string | null;
  openedDemoAt?: string | null;
  bouncedAt?: string | null;
  complainedAt?: string | null;
};

/** 1 on the first day this domain ever sent, so a fresh setup starts slow. */
export function sendingDay(history: SentOutcome[], now = new Date()): number {
  const stamps = history.map((row) => row.sentAt || "").filter(Boolean).sort();
  if (!stamps.length) return 1;
  const start = Date.parse(dayKey(stamps[0]));
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

export function sendingWindow(history: SentOutcome[], now = new Date()): SendingWindow {
  const day = sendingDay(history, now);
  const dailyCap = Math.min(warmupCap(day), maxSendsPerDay());
  const today = dayKey(now.toISOString());
  const sentToday = history.filter((row) => row.sentAt && dayKey(row.sentAt) === today).length;
  return { day, dailyCap, sentToday, remaining: Math.max(0, dailyCap - sentToday) };
}

/**
 * Gmail treats a 0.1% complaint rate as the danger line and 0.3% as trouble, so
 * 0.3% is where this stops. At low volume a rate is meaningless, so there is
 * also an absolute trigger: two complaints is a pattern, not luck.
 */
export const LIMITS = {
  complaintRate: 0.003,
  complaintRateMinSample: 100,
  absoluteComplaints: 2,
  window: 500,
  bounceRate: 0.05,
  bounceRateMinSample: 20,
} as const;

export type Breaker = { tripped: boolean; reasons: string[] };

export function circuitBreaker(history: SentOutcome[]): Breaker {
  const sent = history
    .filter((row) => row.sentAt)
    .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))
    .slice(0, LIMITS.window);
  const reasons: string[] = [];
  if (!sent.length) return { tripped: false, reasons };

  const complaints = sent.filter((row) => row.complainedAt).length;
  const bounces = sent.filter((row) => row.bouncedAt).length;

  if (complaints >= LIMITS.absoluteComplaints) {
    reasons.push(
      `${complaints} spam complaints in the last ${sent.length} sends. Stop and fix the list or the copy.`,
    );
  } else if (
    sent.length >= LIMITS.complaintRateMinSample &&
    complaints / sent.length > LIMITS.complaintRate
  ) {
    reasons.push(
      `Complaint rate ${((complaints / sent.length) * 100).toFixed(2)}% is over ${(LIMITS.complaintRate * 100).toFixed(1)}%.`,
    );
  }
  if (sent.length >= LIMITS.bounceRateMinSample && bounces / sent.length > LIMITS.bounceRate) {
    reasons.push(
      `Bounce rate ${((bounces / sent.length) * 100).toFixed(1)}% is over ${(LIMITS.bounceRate * 100).toFixed(0)}%. The list is stale.`,
    );
  }
  return { tripped: reasons.length > 0, reasons };
}

export type SendPlan = {
  send: number;
  window: SendingWindow;
  breaker: Breaker;
  blocked: string[];
  notes: string[];
};

/**
 * The whole send decision in one place: is it switched on, is it safe, is it the
 * right time of day, and how much headroom is left.
 */
export function planSends(
  history: SentOutcome[],
  options: { batch?: number; now?: Date; ignoreWindow?: boolean } = {},
): SendPlan {
  const now = options.now || new Date();
  const window = sendingWindow(history, now);
  const breaker = circuitBreaker(history);
  const blocked: string[] = [];
  const notes: string[] = [];

  if (!isSendEnabled()) {
    blocked.push("NEXUS_SEND_ENABLED is not true. Nothing transmits. Drafting and queueing only.");
  }
  if (breaker.tripped) blocked.push(...breaker.reasons);
  if (!options.ignoreWindow && !isWithinWindow(now)) {
    blocked.push(
      `Outside the send window (${WINDOW_START_HOUR}:00–${WINDOW_END_HOUR}:00 ${OUTREACH_TZ}, weekdays).`,
    );
  }
  if (!window.remaining) {
    blocked.push(`Day ${window.day} cap of ${window.dailyCap} is already used.`);
  }

  if (blocked.length) return { send: 0, window, breaker, blocked, notes };

  const batch = options.batch && options.batch > 0 ? options.batch : window.dailyCap;
  const send = Math.min(batch, window.remaining);
  notes.push(`Day ${window.day}: ${window.sentToday}/${window.dailyCap} sent, ${send} clear to go.`);
  return { send, window, breaker, blocked, notes };
}

/** Outcome weights. A signup is worth far more than a reply. */
export const SCORE = {
  signedUp: 100,
  replied: 30,
  openedDemo: 8,
  bounced: -5,
  complained: -100,
} as const;

export function scoreOutcome(row: SentOutcome): number {
  if (!row.sentAt) return 0;
  let score = 0;
  if (row.signedUpAt) score += SCORE.signedUp;
  if (row.repliedAt) score += SCORE.replied;
  if (row.openedDemoAt) score += SCORE.openedDemo;
  if (row.bouncedAt) score += SCORE.bounced;
  if (row.complainedAt) score += SCORE.complained;
  return score;
}

/** Worth imitating: it worked, and nobody complained about it. */
export function isWinner(row: SentOutcome): boolean {
  if (row.complainedAt) return false;
  return scoreOutcome(row) >= SCORE.replied;
}

/**
 * Nova's wall clock.
 *
 * Ported from RideBy's Nova. A model with no clock will confidently tell you
 * it is Tuesday, so every request gets a freshly formatted block and is told to
 * read it instead of guessing. Never cache this at boot.
 */

export const NOVA_TZ = process.env.NOVA_TIMEZONE?.trim() || "America/New_York";

export type NovaClock = {
  timeZone: string;
  isoUtc: string;
  isoLocal: string;
  weekday: string;
  date: string;
  time: string;
  timeWithZone: string;
};

export function getNovaClock(now: Date = new Date()): NovaClock {
  const timeZone = NOVA_TZ;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const timeWithZone = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(now);
  // en-CA gives YYYY-MM-DD on every engine we care about.
  const isoLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(", ", "T");

  return { timeZone, isoUtc: now.toISOString(), isoLocal, weekday, date, time, timeWithZone };
}

/** Regenerated on every chat call, never stored. */
export function novaClockBlock(now: Date = new Date()): string {
  const c = getNovaClock(now);
  return [
    "Current date and time (authoritative — answer time questions from this, not memory):",
    `- timezone: ${c.timeZone}`,
    `- local: ${c.weekday}, ${c.date}, ${c.timeWithZone}`,
    `- localISO: ${c.isoLocal}`,
    `- utcISO: ${c.isoUtc}`,
  ].join("\n");
}

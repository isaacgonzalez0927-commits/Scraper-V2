export const REQUEST_STATUSES = ['new', 'contacted', 'qualified', 'booked', 'lost'] as const;
export const PRIORITIES = ['normal', 'high', 'urgent'] as const;
export const RULES = {
  invoice: { name: 'Unpaid invoice follow-up', detail: 'Prepare a reminder for invoices that remain unpaid after their due date.' },
  estimate: { name: 'Estimate follow-up', detail: 'Prepare a follow-up for a sent estimate that has not been accepted.' },
  maintenance: { name: 'Maintenance reminder', detail: 'Prepare a booking reminder when an active agreement has a visit due.' },
} as const;
export type RuleKind = keyof typeof RULES;

export function requiredText(value: unknown, label: string, max = 2000) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be under ${max} characters.`);
  return text;
}
export function integer(value: unknown, label: string, min = 0, max = 1_000_000) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
export function validDate(value: unknown, optional = false) {
  const s = String(value ?? '').trim();
  if (!s && optional) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Choose a valid date.');
  const d = new Date(`${s}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error('Choose a valid date.');
  return s;
}
export function localStart(value: unknown) {
  const s = String(value ?? '').trim().slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new Error('Choose a valid start date and time.');
  validDate(s.slice(0, 10));
  if (Number(s.slice(11,13)) > 23 || Number(s.slice(14,16)) > 59) throw new Error('Choose a valid time.');
  return s;
}
/** Shop-local wall time, as used by Sere's existing datetime-local fields. */
export function overlaps(a: string, aMinutes: number, b: string, bMinutes: number, buffer = 0) {
  const startA = Date.parse(`${localStart(a)}:00Z`);
  const startB = Date.parse(`${localStart(b)}:00Z`);
  return startA < startB + (bMinutes + buffer) * 60000 && startB < startA + (aMinutes + buffer) * 60000;
}
export function advanceMonths(value: string, months: number) {
  validDate(value); integer(months, 'Visit interval', 1, 36);
  const d = new Date(`${value}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function safeEmail(value: unknown) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254)) throw new Error('Enter a valid email address.');
  return s;
}

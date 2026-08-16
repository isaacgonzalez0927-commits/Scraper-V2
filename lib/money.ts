/** Integer-cent money. Never use binary floats for currency. */

export function dollarsToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim().replace(/[$,]/g, "");
  if (!text || text === "-" || text === "." || text === "-.") return 0;
  const n = Number(text);
  if (!Number.isFinite(n)) throw new ValueError(`Invalid amount: ${value}`);
  return Math.round(n * 100);
}

class ValueError extends Error {}

export function centsToInput(cents: number | null | undefined): string {
  return (Math.trunc(cents || 0) / 100).toFixed(2);
}

export function formatMoney(cents: number | null | undefined, signed = false): string {
  let value = Math.trunc(cents || 0);
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  value = Math.abs(value);
  return `${sign}$${Math.floor(value / 100).toLocaleString("en-US")}.${String(value % 100).padStart(2, "0")}`;
}

export function lineAmountCents(quantity: string | number, unitPriceCents: number): number {
  const qty = Number(quantity || 0);
  if (!Number.isFinite(qty)) return 0;
  return Math.round(qty * unitPriceCents);
}

export function taxCents(taxableCents: number, taxBps: number): number {
  if (taxableCents <= 0 || taxBps <= 0) return 0;
  return Math.round((taxableCents * taxBps) / 10000);
}

export function marginBps(revenueCents: number, costCents: number): number | null {
  if (revenueCents <= 0) return null;
  return Math.round(((revenueCents - costCents) * 10000) / revenueCents);
}

export function formatPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatMargin(bps: number | null | undefined): string {
  return formatPercent(bps);
}

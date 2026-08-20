import { squareConfig } from "./integrations";
import {
  listSquarePayments,
  listSquarePayouts,
  squarePaymentNetCents,
} from "./square";

export type SquarePayoutRow = {
  id: string;
  amountCents: number;
  status: string;
  arrival: string;
};

export type SquareCash = {
  connected: boolean;
  monthInCents: number;
  inTransitCents: number;
  payouts: SquarePayoutRow[];
  error: string;
};

function nextDayStamp(day: string): string {
  const stamp = new Date(`${day}T00:00:00Z`);
  stamp.setUTCDate(stamp.getUTCDate() + 1);
  return stamp.toISOString();
}

function payoutDay(row: { arrival_date?: string; created_at?: string }): string {
  return (row.arrival_date || row.created_at || "").slice(0, 10);
}

/**
 * Live cash from the shop's Square: completed payments this period and
 * recent payouts to the bank. Square has no available-balance endpoint.
 * Failures never crash Overview.
 */
export async function loadSquareCash(
  organizationId: number,
  periodStart: string,
  periodEnd?: string,
): Promise<SquareCash> {
  const empty: SquareCash = {
    connected: false,
    monthInCents: 0,
    inTransitCents: 0,
    payouts: [],
    error: "",
  };
  const config = await squareConfig(organizationId);
  if (!config?.accessToken) return empty;

  const beginTime = `${periodStart}T00:00:00Z`;
  const endTime = periodEnd ? nextDayStamp(periodEnd) : undefined;
  try {
    const payments = await listSquarePayments(config.accessToken, {
      beginTime,
      endTime,
      locationId: config.locationId,
      sandbox: config.sandbox,
    });
    let payouts: Awaited<ReturnType<typeof listSquarePayouts>> = [];
    let payoutError = "";
    try {
      payouts = await listSquarePayouts(config.accessToken, {
        locationId: config.locationId,
        sandbox: config.sandbox,
        limit: 5,
      });
    } catch (error) {
      payoutError = (error as Error).message || "Could not read Square payouts.";
    }
    return {
      connected: true,
      monthInCents: payments.reduce((sum, row) => sum + squarePaymentNetCents(row), 0),
      inTransitCents: payouts
        .filter((row) => (row.status || "").toUpperCase() === "SENT")
        .reduce((sum, row) => sum + Number(row.amount_money?.amount || 0), 0),
      payouts: payouts.map((row) => ({
        id: row.id || "",
        amountCents: Number(row.amount_money?.amount || 0),
        status: row.status || "",
        arrival: payoutDay(row),
      })),
      error: payoutError,
    };
  } catch (error) {
    return {
      ...empty,
      connected: true,
      error: (error as Error).message || "Could not read Square cash.",
    };
  }
}

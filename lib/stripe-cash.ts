import { stripeConfig } from "./integrations";
import {
  chargeNetCents,
  listCharges,
  listPayouts,
  retrieveBalance,
  usdCents,
} from "./stripe";

export type StripePayoutRow = {
  id: string;
  amountCents: number;
  status: string;
  arrival: string;
};

export type StripeCash = {
  connected: boolean;
  availableCents: number;
  pendingCents: number;
  monthInCents: number;
  payouts: StripePayoutRow[];
  error: string;
};

function unixToDay(unix?: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/**
 * Live cash from the shop's Stripe: what's sitting there, what charged this
 * month, and recent payouts to the bank. Read-only. Failures never crash Overview.
 */
export async function loadStripeCash(
  organizationId: number,
  periodStart: string,
): Promise<StripeCash> {
  const empty: StripeCash = {
    connected: false,
    availableCents: 0,
    pendingCents: 0,
    monthInCents: 0,
    payouts: [],
    error: "",
  };
  const config = await stripeConfig(organizationId);
  if (!config?.secretKey) return empty;

  const createdGte = Math.floor(new Date(`${periodStart}T00:00:00Z`).getTime() / 1000);
  const opts = { stripeAccount: config.stripeAccount };
  try {
    const [balance, charges, payouts] = await Promise.all([
      retrieveBalance(config.secretKey, opts),
      listCharges(config.secretKey, { createdGte, ...opts }),
      listPayouts(config.secretKey, { limit: 5, ...opts }),
    ]);
    return {
      connected: true,
      availableCents: usdCents(balance.available),
      pendingCents: usdCents(balance.pending),
      monthInCents: charges.reduce((sum, charge) => sum + chargeNetCents(charge), 0),
      payouts: payouts.map((row) => ({
        id: row.id || "",
        amountCents: Number(row.amount || 0),
        status: row.status || "",
        arrival: unixToDay(row.arrival_date),
      })),
      error: "",
    };
  } catch (error) {
    return {
      ...empty,
      connected: true,
      error: (error as Error).message || "Could not read Stripe cash.",
    };
  }
}

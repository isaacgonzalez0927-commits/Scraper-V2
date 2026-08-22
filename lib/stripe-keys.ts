/**
 * Restricted API keys (rk_...) are the only keys shops should paste into Sere.
 * They can read balance and charges but cannot drain the account or issue refunds
 * unless you explicitly grant that — unlike sk_ secret keys.
 */

import {
  accountLabel,
  listCharges,
  listPayouts,
  retrieveAccount,
  retrieveBalance,
} from "./stripe";

export const STRIPE_API_KEYS_URL = "https://dashboard.stripe.com/apikeys";

export function looksLikeStripeRestrictedKey(key: string): boolean {
  return /^rk_(test|live)_/.test(key.trim());
}

export function isStripeFullSecretKey(key: string): boolean {
  return /^sk_(test|live)_/.test(key.trim());
}

export function restrictedKeyRequiredMessage(): string {
  return (
    "Sere only accepts restricted keys (rk_live_ or rk_test_). Full secret keys " +
    "can move money and change payout accounts — too risky to paste into any app. " +
    "Create a restricted key in Stripe (Settings → Integrations has the steps)."
  );
}

export type StripeKeyCheck = {
  ok: boolean;
  label: string;
  problems: string[];
};

/**
 * Confirms the key is restricted and has the permissions Sere needs for cash view.
 * Checkout on invoice links additionally needs Checkout Sessions: Write — optional.
 */
export async function validateStripeKeyForSere(key: string): Promise<StripeKeyCheck> {
  const trimmed = key.trim();
  if (isStripeFullSecretKey(trimmed)) {
    return { ok: false, label: "", problems: [restrictedKeyRequiredMessage()] };
  }
  if (!looksLikeStripeRestrictedKey(trimmed)) {
    return {
      ok: false,
      label: "",
      problems: [
        "That does not look like a Stripe restricted key. It should start with rk_live_ or rk_test_.",
      ],
    };
  }

  const problems: string[] = [];
  let label = "";
  try {
    label = accountLabel(await retrieveAccount(trimmed));
  } catch (error) {
    problems.push(`Account (needs Read): ${(error as Error).message}`);
  }
  try {
    await retrieveBalance(trimmed);
  } catch (error) {
    problems.push(`Balance (needs Read): ${(error as Error).message}`);
  }
  try {
    await listCharges(trimmed, { limit: 1 });
  } catch (error) {
    problems.push(`Charges (needs Read): ${(error as Error).message}`);
  }
  try {
    await listPayouts(trimmed, { limit: 1 });
  } catch (error) {
    problems.push(`Payouts (needs Read): ${(error as Error).message}`);
  }

  if (problems.length) {
    return { ok: false, label, problems };
  }
  return { ok: true, label, problems: [] };
}

/** Permissions to set in the Stripe Dashboard when creating the key. */
export const SERE_STRIPE_PERMISSIONS = {
  required: [
    { resource: "Account", permission: "Read" },
    { resource: "Balance", permission: "Read" },
    { resource: "Charges", permission: "Read" },
    { resource: "Payouts", permission: "Read" },
  ],
  optional: [{ resource: "Checkout Sessions", permission: "Write", for: "Pay with Stripe on invoice links" }],
} as const;

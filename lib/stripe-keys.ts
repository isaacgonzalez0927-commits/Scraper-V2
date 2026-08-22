/**
 * Restricted API keys (rk_...) are the only keys shops should paste into Sere.
 * They can read balance and charges but cannot drain the account or issue refunds
 * unless you explicitly grant that, unlike sk_ secret keys.
 */

import {
  accountLabel,
  listCharges,
  listPayouts,
  retrieveAccount,
  retrieveBalance,
} from "./stripe";

export const STRIPE_API_KEYS_URL = "https://dashboard.stripe.com/apikeys";

/**
 * Dashboard slugs for Create restricted key. Stripe's form reads `permissions[]`
 * the same way ChargebackStop and Stripe's own docs do. `permissions[0]` is
 * ignored, which is why an earlier Sere link created a key with no boxes checked.
 *
 * GET /v1/account needs Connect → Accounts Read (`rak_connected_account_read`),
 * not a slug named rak_account_read.
 * Write implies Read on the same resource.
 */
export const SERE_STRIPE_RAK_PERMISSIONS = [
  "rak_connected_account_read",
  "rak_balance_read",
  "rak_charge_read",
  "rak_payout_read",
  "rak_customer_write",
  "rak_invoice_write",
  "rak_invoiceitem_write",
  "rak_invoice_item_write",
  "rak_checkout_session_write",
] as const;

/** Opens Stripe's create-key screen with Sere's permissions already selected. */
export function stripeCreateRestrictedKeyUrl(opts: { test?: boolean } = {}): string {
  const path = opts.test ? "/test/apikeys/create" : "/apikeys/create";
  const params = new URLSearchParams();
  params.set("name", "Sere");
  for (const permission of SERE_STRIPE_RAK_PERMISSIONS) {
    params.append("permissions[]", permission);
  }
  return `https://dashboard.stripe.com${path}?${params.toString()}`;
}

export const STRIPE_CREATE_KEY_URL = stripeCreateRestrictedKeyUrl();
export const STRIPE_CREATE_TEST_KEY_URL = stripeCreateRestrictedKeyUrl({ test: true });

export function looksLikeStripeRestrictedKey(key: string): boolean {
  return /^rk_(test|live)_/.test(key.trim());
}

export function isStripeFullSecretKey(key: string): boolean {
  return /^sk_(test|live)_/.test(key.trim());
}

export function restrictedKeyRequiredMessage(): string {
  return (
    "Sere only accepts restricted keys (rk_live_ or rk_test_). Full secret keys " +
    "can move money and change payout accounts. Too risky to paste into any app. " +
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
 * Checkout on invoice links additionally needs Checkout Sessions: Write (optional).
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
  } catch {
    // Connect → Accounts Read is only needed for the shop name. Cash view
    // uses Balance, Charges, and Payouts. Do not reject a working cash key.
    label = "Stripe";
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

export function stripeKeyDeniedMessage(problems: string[]): string {
  const missing = problems
    .map((row) => row.replace(/:[\s\S]*$/, "").trim())
    .filter(Boolean);
  const list = missing.join(", ") || "the permissions Sere needs";
  return (
    `That key is missing ${list}. Tap Create the Sere key again and glance at ` +
    `the list: Balance, Charges, and Payouts should be Read; Customers, Invoices, ` +
    `and Invoice Items should be Write. Then paste the new rk_ key.`
  );
}

/** Permissions to set in the Stripe Dashboard when creating the key. */
export const SERE_STRIPE_PERMISSIONS = {
  required: [
    { resource: "Balance", permission: "Read" },
    { resource: "Charges", permission: "Read" },
    { resource: "Payouts", permission: "Read" },
  ],
  optional: [
    { resource: "Connect: Accounts", permission: "Read", for: "Shop name on Overview" },
    { resource: "Customers", permission: "Write", for: "Customer and invoice sync" },
    { resource: "Invoices", permission: "Write", for: "Invoice sync" },
    { resource: "Invoice Items", permission: "Write", for: "Invoice sync" },
    { resource: "Checkout Sessions", permission: "Write", for: "Pay with Stripe on invoice links" },
  ],
} as const;

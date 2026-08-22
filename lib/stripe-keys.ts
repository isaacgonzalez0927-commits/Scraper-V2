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

export const SERE_SITE_URL = "https://www.sere.cash";

/** Stripe Developers → API keys in the sandbox (test) environment. */
export const STRIPE_SANDBOX_DEVELOPERS_URL =
  "https://dashboard.stripe.com/test/developers";
export const STRIPE_SANDBOX_API_KEYS_URL =
  "https://dashboard.stripe.com/test/apikeys";
export const STRIPE_LIVE_API_KEYS_URL = "https://dashboard.stripe.com/apikeys";

/** Default connect link: sandbox Developers, not the live create-key wizard. */
export const STRIPE_API_KEYS_URL = STRIPE_SANDBOX_API_KEYS_URL;
export const STRIPE_CREATE_KEY_URL = STRIPE_SANDBOX_API_KEYS_URL;
export const STRIPE_CREATE_TEST_KEY_URL = STRIPE_SANDBOX_API_KEYS_URL;

/**
 * Stripe slugs for the permissions Sere needs. Kept as a reference for
 * error hints. Do not stuff these into a create-key URL. Stripe's current
 * "another website" wizard ignores query-string slugs, names the key from
 * `name=`, and applies a default third-party set unless Customize
 * permissions is ticked by hand.
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

/** Opens Stripe Developers → API keys. Defaults to the sandbox. */
export function stripeDevelopersApiKeysUrl(opts: { test?: boolean } = {}): string {
  return opts.test === false ? STRIPE_LIVE_API_KEYS_URL : STRIPE_SANDBOX_API_KEYS_URL;
}

/** @deprecated Use stripeDevelopersApiKeysUrl. Permission query params do nothing. */
export function stripeCreateRestrictedKeyUrl(opts: { test?: boolean } = {}): string {
  return stripeDevelopersApiKeysUrl(opts);
}

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
    "Create a restricted key in Stripe Developers (sandbox). Settings → Integrations " +
    "has the steps."
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
    `That key is missing ${list}. The key Stripe named Sere with its default ` +
    `set will keep failing. Open Stripe Developers (sandbox), create a new ` +
    `restricted key, tick Customize permissions, set those rows, and paste ` +
    `the new rk_test_ key.`
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

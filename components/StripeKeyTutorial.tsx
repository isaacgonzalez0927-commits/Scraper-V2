import { STRIPE_API_KEYS_URL, SERE_STRIPE_PERMISSIONS } from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>How to create a restricted key (2 minutes)</summary>
      <p className="help mt-1">
        A <strong>restricted key</strong> (<code>rk_live_...</code>) can only read cash
        data. A full <strong>secret key</strong> (<code>sk_live_...</code>) can refund
        charges and change payout accounts — Sere will not accept it.
      </p>
      <ol className="setup-steps mt-2">
        <li>
          Open{" "}
          <a href={STRIPE_API_KEYS_URL} target="_blank" rel="noreferrer">
            Stripe → Developers → API keys
          </a>{" "}
          and sign in as the shop (not Sere&apos;s account).
        </li>
        <li>
          Click <strong>Create restricted key</strong>. Name it something like{" "}
          <code>Sere cash view</code>.
        </li>
        <li>
          Set permissions to <strong>Read</strong> for:
          <ul className="setup-steps mt-1">
            {SERE_STRIPE_PERMISSIONS.required.map((row) => (
              <li key={row.resource}>
                <strong>{row.resource}</strong> → Read
              </li>
            ))}
          </ul>
          Leave everything else on <strong>None</strong> unless you need invoice checkout
          (see below).
        </li>
        <li>
          Stripe sends a verification code. Enter it, then click <strong>Create key</strong>.
        </li>
        <li>
          Copy the key immediately — it starts with <code>rk_live_</code> or{" "}
          <code>rk_test_</code>. Stripe shows it once.
        </li>
        <li>Paste it below and tap <strong>Connect Stripe</strong>.</li>
      </ol>
      <details className="disclosure mt-2">
        <summary>Optional: Pay with Stripe on invoice links</summary>
        <p className="help mt-1">
          Cash on Overview works without this. To let customers pay an invoice by card,
          also set <strong>{SERE_STRIPE_PERMISSIONS.optional[0].resource}</strong> →{" "}
          <strong>Write</strong>, then add a webhook (shown below the key field).
        </p>
      </details>
      <p className="help mt-2">
        Test first? Toggle <strong>Test mode</strong> in Stripe, create an{" "}
        <code>rk_test_...</code> key with the same permissions, paste that here. Card{" "}
        <code>4242 4242 4242 4242</code> works in test mode.
      </p>
    </details>
  );
}

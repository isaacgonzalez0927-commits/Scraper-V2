import {
  SERE_SITE_URL,
  STRIPE_LIVE_API_KEYS_URL,
  STRIPE_SANDBOX_API_KEYS_URL,
} from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">Four steps. About two minutes. Stay in sandbox.</p>
      <ol className="key-steps">
        <li>
          Open{" "}
          <a href={STRIPE_SANDBOX_API_KEYS_URL} target="_blank" rel="noreferrer">
            Stripe Developers
          </a>
          . Test mode → Developers → API keys → Create restricted key.{" "}
          <a href={STRIPE_LIVE_API_KEYS_URL} target="_blank" rel="noreferrer">
            Live keys later
          </a>
          .
        </li>
        <li>
          How you will use it: <strong>Providing this key to another website</strong>.
          Name it Sere. URL: <code>{SERE_SITE_URL}</code>. Tick{" "}
          <strong>Customize permissions for this key</strong>.
        </li>
        <li>
          Tick only these. Leave everything else None.
          <ul className="key-perms">
            <li>
              <strong>Read:</strong> Balance, Charges, Payouts, Connect → Accounts
            </li>
            <li>
              <strong>Write:</strong> Customers, Invoices, Invoice Items, Checkout
              Sessions, Payment Intents
            </li>
          </ul>
        </li>
        <li>
          Copy the <code>rk_test_</code> key and paste it below. Never paste{" "}
          <code>sk_</code>. That one can move money.
        </li>
      </ol>
    </div>
  );
}

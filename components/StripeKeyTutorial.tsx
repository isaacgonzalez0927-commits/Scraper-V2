import { CreateSereKeyButton } from "@/components/ConnectStripe";
import { SERE_SITE_URL } from "@/lib/stripe-keys";

export function StripeKeyTutorial({
  defaultOpen = true,
  live = false,
}: {
  defaultOpen?: boolean;
  live?: boolean;
}) {
  const prefix = live ? "rk_live_" : "rk_test_";
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">
        Create a restricted key named Sere. Paste it below. Never paste the full
        secret key.
      </p>
      <div className="key-guide-cta">
        <CreateSereKeyButton live={live} />
      </div>
      <ol className="key-steps">
        <li>
          Tap Create the Sere key. Stripe opens with the permissions already
          ticked. Name it Sere. Site: <code>{SERE_SITE_URL}</code>.
        </li>
        <li>
          Copy the <code>{prefix}</code> key, paste it below, and tap Connect
          Stripe. Never paste <code>sk_</code>. That one can move money.
        </li>
      </ol>
      <details className="disclosure">
        <summary>What the Sere key can do</summary>
        <ul className="key-perms">
          <li>
            <strong>Read:</strong> Balance, Charges, Payouts, Connect → Accounts
          </li>
          <li>
            <strong>Write:</strong> Customers, Invoices, Invoice Items, Checkout
            Sessions, Payment Intents
          </li>
        </ul>
        <p className="help mt-1">Leave everything else None. No Refunds Write.</p>
      </details>
    </div>
  );
}

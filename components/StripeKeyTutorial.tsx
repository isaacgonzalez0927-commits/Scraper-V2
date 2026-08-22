import { STRIPE_API_KEYS_URL } from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">
        Three taps in Stripe. Paste the <code>rk_</code> key here. Never the secret{" "}
        <code>sk_</code> key — that one can move money.
      </p>
      <ol className="key-steps">
        <li>
          <a href={STRIPE_API_KEYS_URL} target="_blank" rel="noreferrer">
            Open Stripe API keys
          </a>
        </li>
        <li>
          Click <strong>Create restricted key</strong> · name it <em>Sere</em>
        </li>
        <li>
          Turn on <strong>Read</strong> for Account, Balance, Charges, Payouts.
          For invoices to sync, also turn on <strong>Write</strong> for Customers,
          Invoices, and Invoice Items.
        </li>
        <li>Copy the key (<code>rk_live_</code> or <code>rk_test_</code>) and paste below.</li>
      </ol>
    </div>
  );
}

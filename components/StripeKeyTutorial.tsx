import {
  STRIPE_CREATE_KEY_URL,
  STRIPE_CREATE_TEST_KEY_URL,
} from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">
        One link in Stripe. The Sere boxes should already be checked. Paste the{" "}
        <code>rk_</code> key here. Never the secret <code>sk_</code> key. That
        one can move money.
      </p>
      <ol className="key-steps">
        <li>
          <a className="btn btn-sm btn-stripe" href={STRIPE_CREATE_KEY_URL} target="_blank" rel="noreferrer">
            Create the Sere key in Stripe
          </a>
          <span className="tiny" style={{ display: "block", marginTop: 6 }}>
            Live mode.{" "}
            <a href={STRIPE_CREATE_TEST_KEY_URL} target="_blank" rel="noreferrer">
              Test mode instead
            </a>
            .
          </span>
        </li>
        <li>
          Glance at the list before you create it.{" "}
          <strong>Read</strong> on Balance, Charges, Payouts, and Connect → Accounts.{" "}
          <strong>Write</strong> on Customers, Invoices, Invoice Items, and Checkout Sessions.
        </li>
        <li>
          Name it <em>Sere</em>, create, copy the <code>rk_live_</code> or{" "}
          <code>rk_test_</code> key, paste below.
        </li>
      </ol>
    </div>
  );
}

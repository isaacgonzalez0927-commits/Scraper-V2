import {
  STRIPE_CREATE_KEY_URL,
  STRIPE_CREATE_TEST_KEY_URL,
} from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">
        One link in Stripe. The Sere boxes are already checked. Paste the{" "}
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
          Confirm the name is <em>Sere</em>, create the key, copy it (
          <code>rk_live_</code> or <code>rk_test_</code>).
        </li>
        <li>Paste below and tap Connect.</li>
      </ol>
    </div>
  );
}

import {
  SERE_SITE_URL,
  STRIPE_LIVE_API_KEYS_URL,
  STRIPE_SANDBOX_API_KEYS_URL,
} from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">
        Use Stripe&apos;s <strong>sandbox</strong> (Developers, test mode). A
        link that only names the key <em>Sere</em> still gets Stripe&apos;s
        default third-party permissions. Those are the wrong boxes. Never paste
        the secret <code>sk_</code> key. That one can move money.
      </p>
      <ol className="key-steps">
        <li>
          <a
            className="btn btn-connect btn-stripe"
            href={STRIPE_SANDBOX_API_KEYS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Stripe Developers (sandbox)
          </a>
          <span className="tiny" style={{ display: "block", marginTop: 6 }}>
            Test mode → Developers → API keys.{" "}
            <a href={STRIPE_LIVE_API_KEYS_URL} target="_blank" rel="noreferrer">
              Live keys when you are ready
            </a>
            .
          </span>
        </li>
        <li>
          Create restricted key. When Stripe asks how you will use it, pick{" "}
          <strong>Providing this key to another website</strong>.
        </li>
        <li>
          Name it <em>Sere</em>. Website URL: <code>{SERE_SITE_URL}</code>. Then
          tick <strong>Customize permissions for this key</strong>. Skip that
          box and Stripe keeps its own default set.
        </li>
        <li>
          Set <strong>Read</strong> on Balance, Charges, Payouts, and Connect →
          Accounts. Set <strong>Write</strong> on Customers, Invoices, Invoice
          Items, and Checkout Sessions. Leave everything else None.
        </li>
        <li>
          Create it, copy the <code>rk_test_</code> key, paste below. Make a
          new key. The old one named Sere still has the wrong permissions.
        </li>
      </ol>
    </div>
  );
}

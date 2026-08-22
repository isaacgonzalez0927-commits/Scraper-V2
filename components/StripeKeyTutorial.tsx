import { stripeCreateRestrictedKeyUrl } from "@/lib/stripe-keys";

export function StripeKeyTutorial({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const testUrl = stripeCreateRestrictedKeyUrl({ test: true });
  const liveUrl = stripeCreateRestrictedKeyUrl({ test: false });
  return (
    <div className={`key-guide${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <a className="btn btn-stripe key-guide-cta" href={testUrl} target="_blank" rel="noreferrer">
        Create the Sere key
      </a>
      <p className="key-guide-lede">
        Opens Stripe with the permissions already filled. Copy the{" "}
        <code>rk_test_</code> key and paste it below. Never paste <code>sk_</code>.
      </p>
      <p className="help">
        Real cash later:{" "}
        <a href={liveUrl} target="_blank" rel="noreferrer">
          create a live key
        </a>{" "}
        with the same boxes checked.
      </p>
    </div>
  );
}

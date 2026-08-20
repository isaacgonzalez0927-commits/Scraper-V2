import { startStripeConnectAction } from "@/app/actions";
import { stripeConnectEnabled } from "@/lib/stripe";

export function ConnectStripeButton({
  label = "Connect Stripe",
  secondary,
  large,
}: {
  label?: string;
  secondary?: boolean;
  large?: boolean;
}) {
  const className = [
    "btn",
    secondary ? "btn-secondary" : "btn-stripe",
    large ? "btn-connect-lg" : "",
  ].filter(Boolean).join(" ");
  if (!stripeConnectEnabled()) {
    return (
      <a className={className} href="/settings?tab=integrations">
        {label}
      </a>
    );
  }
  return (
    <form action={startStripeConnectAction}>
      <button className={className} type="submit">
        {label}
      </button>
    </form>
  );
}

export function ConnectStripeCallout() {
  return (
    <div className="connect-cta">
      <div>
        <strong>Let customers pay invoices online.</strong>
        <p>
          About a minute. Open the shop&apos;s Stripe, copy the secret key, paste it
          in Settings. Money goes to their Stripe, not yours.
        </p>
      </div>
      <ConnectStripeButton large />
    </div>
  );
}

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
          Connect the shop's own Stripe account. That is the main way customers pay
          an invoice by card. Square and PayPal are available too if that is what
          the shop already uses.
        </p>
      </div>
      <ConnectStripeButton large />
    </div>
  );
}

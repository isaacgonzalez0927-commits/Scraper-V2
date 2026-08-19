import { startStripeConnectAction } from "@/app/actions";
import { stripeConnectEnabled } from "@/lib/stripe";

export function ConnectStripeButton({
  label = "Connect Stripe",
  secondary,
}: {
  label?: string;
  secondary?: boolean;
}) {
  const className = secondary ? "btn btn-secondary" : "btn";
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
          Connect the shop's own Stripe account. Card payments land in their bank,
          not yours. Cash, check, Zelle, and Venmo can still be recorded by hand.
        </p>
      </div>
      <ConnectStripeButton />
    </div>
  );
}

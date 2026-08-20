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
        <strong>See the cash that is actually in Stripe.</strong>
        <p>
          Overview and Reports then show available balance, pending funds, and
          payouts to the bank. About a minute: copy the shop&apos;s secret key in
          Stripe and paste it in Settings.
        </p>
      </div>
      <ConnectStripeButton large />
    </div>
  );
}

import { startStripeConnectAction } from "@/app/actions";
import { stripeConnectEnabled } from "@/lib/stripe";

export const STRIPE_KEYS_URL = "https://dashboard.stripe.com/apikeys";
export const SQUARE_KEYS_URL = "https://developer.squareup.com/apps";

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
      <a className={className} href="/settings?tab=integrations#stripe">
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

export function ConnectSquareButton({
  label = "Connect Square",
  large,
}: {
  label?: string;
  large?: boolean;
}) {
  const className = ["btn", "btn-square", large ? "btn-connect-lg" : ""].filter(Boolean).join(" ");
  return (
    <a className={className} href="/settings?tab=integrations#square">
      {label}
    </a>
  );
}

export function StripeKeyLink() {
  return (
    <a href={STRIPE_KEYS_URL} target="_blank" rel="noreferrer">
      Get the key from Stripe
    </a>
  );
}

export function SquareKeyLink() {
  return (
    <a href={SQUARE_KEYS_URL} target="_blank" rel="noreferrer">
      Get the key from Square
    </a>
  );
}

export function ConnectCashCallout({
  stripe,
  square,
}: {
  stripe: boolean;
  square: boolean;
}) {
  const needStripe = !stripe;
  const needSquare = !square;
  if (!needStripe && !needSquare) return null;
  const both = needStripe && needSquare;
  return (
    <div className="connect-cta">
      <div>
        <strong>
          {both
            ? "Connect Stripe or Square to see live cash."
            : needStripe
              ? "Connect Stripe to see live cash."
              : "Connect Square to see live cash."}
        </strong>
        <p>
          Overview then shows what actually landed in that account, not just
          invoices you typed. About a minute in Settings.
        </p>
      </div>
      <div className="connect-cta-actions">
        {needStripe ? <ConnectStripeButton large /> : null}
        {needSquare ? <ConnectSquareButton large /> : null}
      </div>
    </div>
  );
}

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

export function OpenStripeKeys({ large }: { large?: boolean }) {
  const className = ["btn", "btn-stripe", large ? "btn-connect-lg" : ""].filter(Boolean).join(" ");
  return (
    <a className={className} href={STRIPE_KEYS_URL} target="_blank" rel="noreferrer">
      Open Stripe keys
    </a>
  );
}

export function OpenSquareKeys({ large }: { large?: boolean }) {
  const className = ["btn", "btn-square", large ? "btn-connect-lg" : ""].filter(Boolean).join(" ");
  return (
    <a className={className} href={SQUARE_KEYS_URL} target="_blank" rel="noreferrer">
      Open Square keys
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
  const pasteHash = both ? "" : needSquare ? "#square" : "#stripe";
  return (
    <div className="connect-cta">
      <div>
        <strong>
          {both
            ? "See the cash in Stripe or Square."
            : needStripe
              ? "See the cash that is actually in Stripe."
              : "See the cash that is actually in Square."}
        </strong>
        <p>
          Tap the keys page, copy, then paste in Settings. About a minute.
          Overview then shows what actually landed, not just invoices you typed.
        </p>
      </div>
      <div className="connect-cta-actions">
        {needStripe ? <OpenStripeKeys large /> : null}
        {needSquare ? <OpenSquareKeys large /> : null}
        <a className="btn btn-secondary" href={`/settings?tab=integrations${pasteHash}`}>
          Paste in Settings
        </a>
      </div>
    </div>
  );
}

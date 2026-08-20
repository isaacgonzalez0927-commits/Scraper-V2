import { connectSquareAction, connectStripeAction, startStripeConnectAction } from "@/app/actions";
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

function ConnectStripePaste({ next }: { next: string }) {
  return (
    <form action={connectStripeAction} className="connect-paste">
      <input type="hidden" name="next" value={next} />
      <input
        className="input"
        name="stripe_secret_key"
        type="password"
        autoComplete="off"
        required
        spellCheck={false}
        placeholder="Paste sk_live_... or sk_test_..."
        aria-label="Stripe secret key"
      />
      <button className="btn btn-stripe btn-connect-lg" type="submit">
        Connect Stripe
      </button>
    </form>
  );
}

function ConnectSquarePaste({ next }: { next: string }) {
  return (
    <form action={connectSquareAction} className="connect-paste">
      <input type="hidden" name="next" value={next} />
      <input
        className="input"
        name="square_access_token"
        type="password"
        autoComplete="off"
        required
        spellCheck={false}
        placeholder="Paste the Square access token"
        aria-label="Square access token"
      />
      <button className="btn btn-square btn-connect-lg" type="submit">
        Connect Square
      </button>
    </form>
  );
}

export function ConnectCashCallout({
  stripe,
  square,
  next = "/overview",
}: {
  stripe: boolean;
  square: boolean;
  next?: string;
}) {
  const needStripe = !stripe;
  const needSquare = !square;
  if (!needStripe && !needSquare) return null;
  return (
    <div className="connect-cta connect-cta-stack">
      {needStripe ? (
        <div className="connect-cta-block">
          <strong>Connect Stripe</strong>
          <p>
            Paste the shop&apos;s secret key here. Overview then shows cash that
            actually landed. Need the key? <StripeKeyLink /> — reveal Secret key,
            copy, come back and paste.
          </p>
          <ConnectStripePaste next={next} />
        </div>
      ) : null}
      {needSquare ? (
        <div className="connect-cta-block">
          <strong>Connect Square</strong>
          <p>
            Paste the shop&apos;s access token here. Same idea: live Square cash
            next to invoices you typed. Need the token? <SquareKeyLink /> —
            Credentials, Production, copy, paste.
          </p>
          <ConnectSquarePaste next={next} />
        </div>
      ) : null}
    </div>
  );
}

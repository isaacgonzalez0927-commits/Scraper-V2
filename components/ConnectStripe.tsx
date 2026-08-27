import {
  STRIPE_API_KEYS_URL,
  STRIPE_SANDBOX_API_KEYS_URL,
  stripeCreateRestrictedKeyUrl,
} from "@/lib/stripe-keys";

export { STRIPE_API_KEYS_URL as STRIPE_KEYS_URL };
export const CONNECT_STRIPE_HREF = "/settings?tab=integrations#stripe";
export const CONNECT_SQUARE_HREF = "/settings?tab=integrations#square";
export const CONNECT_QUICKBOOKS_HREF = "/settings?tab=integrations#quickbooks";
export const SQUARE_KEYS_URL = "https://developer.squareup.com/apps";
export const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
export const OPENAI_LIMITS_URL = "https://platform.openai.com/settings/organization/limits";

export function ConnectStripeButton() {
  return (
    <a className="btn btn-connect btn-stripe" href={CONNECT_STRIPE_HREF}>
      Connect Stripe
    </a>
  );
}

export function ConnectSquareButton() {
  return (
    <a className="btn btn-connect btn-square" href={CONNECT_SQUARE_HREF}>
      Connect Square
    </a>
  );
}

export function CreateSereKeyButton({
  live = false,
  className = "btn btn-connect btn-stripe btn-connect-lg",
}: {
  live?: boolean;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={stripeCreateRestrictedKeyUrl({ test: !live })}
      target="_blank"
      rel="noreferrer"
    >
      Create the Sere key
    </a>
  );
}

export function ConnectQuickBooksButton() {
  return (
    <a className="btn btn-connect btn-quickbooks" href={CONNECT_QUICKBOOKS_HREF}>
      QuickBooks
    </a>
  );
}

export function StripeKeyLink() {
  return (
    <a href={STRIPE_SANDBOX_API_KEYS_URL} target="_blank" rel="noreferrer">
      Open Stripe Developers (sandbox)
    </a>
  );
}

export function SquareKeyLink() {
  return (
    <a href={SQUARE_KEYS_URL} target="_blank" rel="noreferrer">
      Square Developers
    </a>
  );
}

export function SquareKeyTutorial() {
  return (
    <div className="key-guide">
      <p className="key-guide-lede">
        Open Square Developers, copy the production access token, paste it below.
      </p>
      <div className="key-guide-cta">
        <a
          className="btn btn-connect btn-square btn-connect-lg"
          href={SQUARE_KEYS_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open Square Developers
        </a>
      </div>
      <ol className="key-steps">
        <li>Pick your app, or create one.</li>
        <li>
          Credentials, then Production. Copy the access token. Use Sandbox only
          for a test app.
        </li>
        <li>Paste it below and tap Connect Square.</li>
      </ol>
    </div>
  );
}

export function OpenAIKeyLink() {
  return (
    <a href={OPENAI_KEYS_URL} target="_blank" rel="noreferrer">
      OpenAI API keys
    </a>
  );
}

export function OpenAILimitsLink() {
  return (
    <a href={OPENAI_LIMITS_URL} target="_blank" rel="noreferrer">
      Set a monthly budget
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
  return (
    <div className="connect-cta connect-cta-compact">
      <div className="connect-cta-block">
        <strong>See cash that actually landed</strong>
        <p>Connect the account you already take cards with. The walkthrough is on Integrations.</p>
        <div className="connect-cta-actions">
          {needStripe ? <ConnectStripeButton /> : null}
          {needSquare ? <ConnectSquareButton /> : null}
        </div>
      </div>
    </div>
  );
}

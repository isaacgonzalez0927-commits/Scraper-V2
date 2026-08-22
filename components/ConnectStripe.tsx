import { STRIPE_API_KEYS_URL, STRIPE_SANDBOX_API_KEYS_URL } from "@/lib/stripe-keys";

export { STRIPE_API_KEYS_URL as STRIPE_KEYS_URL };
export const CONNECT_STRIPE_HREF = "/settings?tab=integrations#stripe";
export const CONNECT_SQUARE_HREF = "/settings?tab=integrations#square";
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
      <p className="key-guide-lede">Three steps. Same idea as Stripe.</p>
      <ol className="key-steps">
        <li>
          Open{" "}
          <a href={SQUARE_KEYS_URL} target="_blank" rel="noreferrer">
            Square Developers
          </a>
          . Pick your app, or create one.
        </li>
        <li>
          Credentials → Production. Copy the access token. Use Sandbox only if
          that is a test app.
        </li>
        <li>Paste it below. Tap Connect Square.</li>
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

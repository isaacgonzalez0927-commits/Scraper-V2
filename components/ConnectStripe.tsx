import { connectOpenAIAction, connectSquareAction, connectStripeAction } from "@/app/actions";
import { StripeKeyTutorial } from "@/components/StripeKeyTutorial";
import { STRIPE_API_KEYS_URL } from "@/lib/stripe-keys";

export { STRIPE_API_KEYS_URL as STRIPE_KEYS_URL };
export const SQUARE_KEYS_URL = "https://developer.squareup.com/apps";
export const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
export const OPENAI_LIMITS_URL = "https://platform.openai.com/settings/organization/limits";

/** Stripe Connect OAuth — optional; needs a verified platform account. */
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
  return (
    <a className={className} href="/settings?tab=integrations#stripe">
      {label}
    </a>
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
    <a href={STRIPE_API_KEYS_URL} target="_blank" rel="noreferrer">
      Stripe API keys
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

export function OpenAIKeyLink() {
  return (
    <a href={OPENAI_KEYS_URL} target="_blank" rel="noreferrer">
      Get an API key from OpenAI
    </a>
  );
}

export function OpenAILimitsLink() {
  return (
    <a href={OPENAI_LIMITS_URL} target="_blank" rel="noreferrer">
      Set a monthly budget in OpenAI
    </a>
  );
}

function ConnectStripePaste({ next }: { next: string }) {
  return (
    <>
      <StripeKeyTutorial defaultOpen={false} />
      <form action={connectStripeAction} className="connect-paste">
        <input type="hidden" name="next" value={next} />
        <input
          className="input"
          name="stripe_secret_key"
          type="password"
          autoComplete="off"
          required
          spellCheck={false}
          placeholder="Paste rk_live_... or rk_test_..."
          aria-label="Stripe restricted key"
        />
        <button className="btn btn-stripe btn-connect-lg" type="submit">
          Connect Stripe
        </button>
      </form>
    </>
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
            Create a <strong>restricted key</strong> in Stripe (<code>rk_live_...</code>),
            paste it here, and Overview shows cash that actually landed.{" "}
            <StripeKeyLink /> — Create restricted key, not the secret key.
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

function ConnectOpenAIPaste({ next }: { next: string }) {
  return (
    <form action={connectOpenAIAction} className="connect-paste">
      <input type="hidden" name="next" value={next} />
      <input
        className="input"
        name="openai_api_key"
        type="password"
        autoComplete="off"
        required
        spellCheck={false}
        placeholder="Paste sk-... or sk-proj-..."
        aria-label="OpenAI API key"
      />
      <button className="btn btn-openai btn-connect-lg" type="submit">
        Connect OpenAI
      </button>
    </form>
  );
}

export function ConnectAssistantCallout({
  connected,
  next = "/overview",
}: {
  connected: boolean;
  next?: string;
}) {
  if (connected) return null;
  return (
    <div className="connect-cta connect-cta-stack" id="openai">
      <div className="connect-cta-block">
        <strong>Connect OpenAI</strong>
        <p>
          Paste an API key if you want this shop billed on its own OpenAI
          account. Completing or moving a job still goes through Sere, not the
          model. Need a key? <OpenAIKeyLink />. Cap spend with{" "}
          <OpenAILimitsLink /> — $5 a month is enough for gpt-4o-mini.
        </p>
        <ConnectOpenAIPaste next={next} />
      </div>
    </div>
  );
}

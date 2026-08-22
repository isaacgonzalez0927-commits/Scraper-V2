import { connectOpenAIAction, connectSquareAction, connectStripeAction } from "@/app/actions";
import { StripeKeyTutorial } from "@/components/StripeKeyTutorial";
import { STRIPE_API_KEYS_URL, STRIPE_CREATE_KEY_URL } from "@/lib/stripe-keys";

export { STRIPE_API_KEYS_URL as STRIPE_KEYS_URL };
export const SQUARE_KEYS_URL = "https://developer.squareup.com/apps";
export const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
export const OPENAI_LIMITS_URL = "https://platform.openai.com/settings/organization/limits";

export function ConnectStripeButton({
  label = "Connect Stripe",
  secondary,
}: {
  label?: string;
  secondary?: boolean;
  large?: boolean;
}) {
  const className = ["btn", "btn-sm", secondary ? "btn-secondary" : "btn-stripe"].filter(Boolean).join(" ");
  return (
    <a className={className} href="/settings?tab=integrations#stripe">
      {label}
    </a>
  );
}

export function ConnectSquareButton({
  label = "Connect Square",
}: {
  label?: string;
  large?: boolean;
}) {
  return (
    <a className="btn btn-sm btn-square" href="/settings?tab=integrations#square">
      {label}
    </a>
  );
}

export function StripeKeyLink() {
  return (
    <a href={STRIPE_CREATE_KEY_URL} target="_blank" rel="noreferrer">
      Create the Sere key in Stripe
    </a>
  );
}

export function SquareKeyLink() {
  return (
    <a href={SQUARE_KEYS_URL} target="_blank" rel="noreferrer">
      Square credentials
    </a>
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
        placeholder="rk_live_... or rk_test_..."
        aria-label="Stripe restricted key"
      />
      <button className="btn btn-sm btn-stripe" type="submit">
        Connect
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
        placeholder="Square access token"
        aria-label="Square access token"
      />
      <button className="btn btn-sm btn-square" type="submit">
        Connect
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
          <strong>See live Stripe cash</strong>
          <StripeKeyTutorial />
          <ConnectStripePaste next={next} />
        </div>
      ) : null}
      {needSquare ? (
        <div className="connect-cta-block">
          <strong>See live Square cash</strong>
          <p>
            From <SquareKeyLink />, open Credentials → Production, copy the access
            token, paste it here.
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
        placeholder="sk-... or sk-proj-..."
        aria-label="OpenAI API key"
      />
      <button className="btn btn-sm btn-openai" type="submit">
        Connect
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
    <div className="connect-cta connect-cta-compact" id="openai">
      <div className="connect-cta-block">
        <strong>Shop assistant</strong>
        <p>
          Optional. Paste an OpenAI key if this shop should be billed on its own
          account. <OpenAIKeyLink /> · <OpenAILimitsLink /> ($5/mo is enough).
        </p>
        <ConnectOpenAIPaste next={next} />
      </div>
    </div>
  );
}

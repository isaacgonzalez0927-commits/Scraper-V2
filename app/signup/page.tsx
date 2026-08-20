import Link from "next/link";
import { signupAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Banner } from "@/components/ui";
import { TRADE_LIST } from "@/lib/business";
import { planByKey } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const STRIPE_KEYS = "https://dashboard.stripe.com/apikeys";
const SQUARE_KEYS = "https://developer.squareup.com/apps";
const OPENAI_KEYS = "https://platform.openai.com/api-keys";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string }>;
}) {
  const q = await searchParams;
  const picked = planByKey(q.plan);
  return (
    <div className="auth">
      <div className="auth-card auth-wide">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
          <ThemeToggle />
        </div>
        <h1 className="auth-title">Create your shop</h1>
        <p className="auth-sub">
          14 days of the book. Shop name and an account are enough. Trade,
          Stripe, Square, and OpenAI are optional — skip them and set them later.
        </p>
        {picked ? (
          <p className="signup-plan">
            You picked <strong>{picked.name}</strong> at ${picked.price}/month
            after the trial. Create the shop now. We will not charge a card
            until billing is live.
          </p>
        ) : (
          <p className="signup-plan">
            14 days of Shop. Then $39/month for two people and live Stripe cash.
            Crew is $79. We are not taking cards yet — after 14 days the shop
            freezes until billing opens.
          </p>
        )}
        <Banner error={q.error} />
        <form action={signupAction} className="stack">
          {picked ? <input type="hidden" name="plan" value={picked.key} /> : null}
          <label>
            Shop name
            <input name="company" required autoComplete="organization" enterKeyHint="next" />
          </label>
          <label>
            Your name
            <input name="name" required autoComplete="name" enterKeyHint="next" />
          </label>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" inputMode="email" enterKeyHint="next" />
          </label>
          <label>
            Password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" enterKeyHint="next" />
          </label>

          <fieldset className="choice-set signup-optional">
            <legend>
              What kind of business <span className="optional-tag">Optional</span>
            </legend>
            <p className="signup-benefit">
              Each trade gets its own words, starter services, and the fields
              that shop actually fills in — equipment, VIN, color formula,
              squares. Skip and Sere stays generic. Change this any time in
              Settings.
            </p>
            <div className="choice-grid">
              <label className="choice choice-span">
                <input type="radio" name="business_type" value="" defaultChecked />
                <span className="choice-copy">
                  <strong>Skip for now</strong>
                  <span>Generic jobs and customers. You can pick a trade later.</span>
                </span>
              </label>
              {TRADE_LIST.map((trade) => (
                <label key={trade.key} className="choice">
                  <input type="radio" name="business_type" value={trade.key} />
                  <span className="choice-copy">
                    <strong>{trade.name}</strong>
                    <span>{trade.signupHint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="choice-set signup-optional">
            <legend>
              Stripe or Square <span className="optional-tag">Optional</span>
            </legend>
            <p className="signup-benefit">
              If the shop already takes cards in Stripe or Square, paste the key
              here. Overview then shows cash that actually landed. This is for
              you, not your customers. Skip and connect later — the paste box
              is on Overview too.
            </p>
            <div className="signup-keys">
              <div className="signup-key">
                <label>
                  Connect Stripe
                  <input
                    name="stripe_secret_key"
                    type="password"
                    autoComplete="off"
                    placeholder="sk_live_... or sk_test_..."
                    spellCheck={false}
                  />
                </label>
                <p className="help">
                  Reveal Secret key in Stripe, copy it, paste it here.{" "}
                  <a href={STRIPE_KEYS} target="_blank" rel="noreferrer">Get the key from Stripe</a>.
                </p>
              </div>
              <div className="signup-key">
                <label>
                  Connect Square
                  <input
                    name="square_access_token"
                    type="password"
                    autoComplete="off"
                    placeholder="From Credentials, Production"
                    spellCheck={false}
                  />
                </label>
                <p className="help">
                  Credentials, then Production, copy Access token, paste it here.{" "}
                  <a href={SQUARE_KEYS} target="_blank" rel="noreferrer">Get the key from Square</a>.
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="choice-set signup-optional">
            <legend>
              Sere assistant <span className="optional-tag">Optional</span>
            </legend>
            <p className="signup-benefit">
              Skip this if Sere already has an OpenAI key on the server. Paste
              your own only if you want GPT billed to you. Completing or moving
              a job still goes through Sere. Cap spend in OpenAI — $5 a month is
              enough for gpt-4o-mini.
            </p>
            <div className="signup-keys">
              <div className="signup-key">
                <label>
                  Connect OpenAI
                  <input
                    name="openai_api_key"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-... or sk-proj-..."
                    spellCheck={false}
                  />
                </label>
                <p className="help">
                  Optional. <a href={OPENAI_KEYS} target="_blank" rel="noreferrer">Get an API key from OpenAI</a>
                  {" "}·{" "}
                  <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noreferrer">Set a monthly budget</a>.
                </p>
              </div>
            </div>
          </fieldset>

          <button className="btn" type="submit">Create shop</button>
          <p className="help">
            You can leave the optional parts blank.{" "}
            <Link href="/#pricing">What Shop and Crew include</Link>.
          </p>
        </form>
        <div className="auth-foot">
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

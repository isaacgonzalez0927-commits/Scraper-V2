import Link from "next/link";
import { signupAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Banner } from "@/components/ui";
import { TRADE_LIST } from "@/lib/business";

export const dynamic = "force-dynamic";

const STRIPE_KEYS = "https://dashboard.stripe.com/apikeys";
const SQUARE_KEYS = "https://developer.squareup.com/apps";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="auth">
      <div className="auth-card auth-wide">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
        </div>
        <h1 className="auth-title">Create your shop</h1>
        <p className="auth-sub">
          Shop name and an account are enough. Trade and Stripe or Square are
          optional — skip them and set them later.
        </p>
        <Banner error={q.error} />
        <form action={signupAction} className="stack">
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
              Jobs, invoices, and the assistant then use your words. HVAC gets
              technicians. A salon gets stylists. Skip and Sere stays generic.
              You can change this any time in Settings.
            </p>
            <div className="choice-grid">
              <label className="choice choice-span">
                <input type="radio" name="business_type" value="" defaultChecked />
                <span>Skip for now</span>
              </label>
              {TRADE_LIST.map((trade) => (
                <label key={trade.key} className="choice">
                  <input type="radio" name="business_type" value={trade.key} />
                  <span>{trade.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="choice-set signup-optional">
            <legend>
              Stripe or Square <span className="optional-tag">Optional</span>
            </legend>
            <p className="signup-benefit">
              If the shop already takes cards in Stripe or Square, paste a key
              so Overview shows cash that actually landed — available, pending,
              and payouts to the bank — next to invoices you type in Sere. This
              is for you, not your customers. Skip and connect later in Settings.
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
                  Paste the secret key so Overview can show live Stripe cash.{" "}
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
                  Paste the access token so Overview can show live Square cash.{" "}
                  <a href={SQUARE_KEYS} target="_blank" rel="noreferrer">Get the key from Square</a>.
                </p>
              </div>
            </div>
          </fieldset>

          <button className="btn" type="submit">Create shop</button>
          <p className="help">You can leave the optional parts blank.</p>
        </form>
        <div className="auth-foot">
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

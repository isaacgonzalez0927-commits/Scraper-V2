import Link from "next/link";
import { signupAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Banner } from "@/components/ui";
import { TRADE_LIST } from "@/lib/business";

export const dynamic = "force-dynamic";

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
        <p className="auth-sub">Tell Sere what you do. Jobs, invoices, and the assistant follow from there.</p>
        <Banner error={q.error} />
        <form action={signupAction} className="stack">
          <label>
            Shop name
            <input name="company" required autoComplete="organization" enterKeyHint="next" />
          </label>
          <fieldset className="choice-set">
            <legend>What kind of business</legend>
            <div className="choice-grid">
              {TRADE_LIST.map((trade) => (
                <label key={trade.key} className="choice">
                  <input type="radio" name="business_type" value={trade.key} required defaultChecked={trade.key === "hvac"} />
                  <span>{trade.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
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
            <input name="password" type="password" required minLength={8} autoComplete="new-password" enterKeyHint="go" />
          </label>
          <button className="btn" type="submit">Create shop</button>
        </form>
        <div className="auth-foot">
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

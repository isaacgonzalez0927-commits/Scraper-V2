import Link from "next/link";
import { signupAction } from "../actions";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";
import { boot } from "@/lib/boot";
import { databaseRefusalMessage, isDurableDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  let bootError = "";
  try {
    await boot();
  } catch (error) {
    console.error(error);
    bootError = databaseRefusalMessage(true);
  }
  const setupError = databaseRefusalMessage(false);
  const blocked = Boolean(bootError) || Boolean(setupError) || !isDurableDatabase();
  const storeError = bootError || setupError;
  return (
    <AuthShell
      title="Create your shop"
      sub="14 days free. No card. Two questions and you are in."
      foot={
        <>
          <span>Already have a shop?</span>
          <Link href="/login">Sign in</Link>
        </>
      }
    >
      <Banner error={storeError || q.error} />
      <form action={signupAction} className="stack">
        <label>
          Shop name
          <input
            name="company"
            required
            autoComplete="organization"
            enterKeyHint="next"
            disabled={blocked}
          />
        </label>
        <label>
          Your name
          <input
            name="name"
            required
            autoComplete="name"
            enterKeyHint="next"
            disabled={blocked}
          />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            disabled={blocked}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            enterKeyHint="go"
            disabled={blocked}
          />
          <span className="auth-hint">At least 8 characters.</span>
        </label>
        <label className="checkbox">
          <input name="agree" type="checkbox" value="1" required disabled={blocked} />
          <span>
            I agree to the <a href="/terms">Terms</a> and{" "}
            <a href="/privacy">Privacy Policy</a>.
          </span>
        </label>
        <button className="btn btn-block" type="submit" disabled={blocked}>
          Create shop
        </button>
      </form>
      <p className="auth-fine">
        You start in Sandbox, like Stripe test mode. After 14 days it is $39 a
        month. We are not taking cards yet.
      </p>
    </AuthShell>
  );
}

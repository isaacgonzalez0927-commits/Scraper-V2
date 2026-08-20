import Link from "next/link";
import { signupAction } from "../actions";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
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
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
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
          />
          <span className="auth-hint">At least 8 characters.</span>
        </label>
        <button className="btn btn-block" type="submit">Create shop</button>
      </form>
      <p className="auth-fine">
        After 14 days it is $39 a month. We are not taking cards yet.
      </p>
    </AuthShell>
  );
}

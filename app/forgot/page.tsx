import Link from "next/link";
import { forgotAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; token?: string; error?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
        </div>
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-sub">Enter the email you sign in with.</p>
        <Banner error={q.error} />
        {q.ok || q.token ? (
          <Banner>
            <div>
              <strong>Reset link created.</strong>
              {q.token ? (
                <p className="mt-1">
                  Email is not connected on this deployment, so open{" "}
                  <Link href={`/reset/${q.token}`}>your reset link</Link> directly.
                </p>
              ) : (
                <p className="mt-1">If that email has an account, the link is on its way.</p>
              )}
            </div>
          </Banner>
        ) : null}
        <form action={forgotAction} className="stack">
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <button className="btn" type="submit">Send reset link</button>
        </form>
        <div className="auth-foot">
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

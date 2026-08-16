import Link from "next/link";
import { forgotAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; token?: string; error?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="page-title" style={{ fontSize: 28 }}>Reset password</h1>
        {q.error ? <div className="flash flash-error">{q.error}</div> : null}
        {q.ok || q.token ? (
          <div className="notice">
            If that email exists, a reset link was created.
            {q.token ? (
              <p>
                SMTP is not required in this environment. Use{" "}
                <Link href={`/reset/${q.token}`}>this reset link</Link>.
              </p>
            ) : (
              <p>Without SMTP, open the latest reset URL from your database.</p>
            )}
          </div>
        ) : null}
        <form action={forgotAction} className="stack">
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <button className="btn" type="submit">Send reset</button>
        </form>
        <p><Link href="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}

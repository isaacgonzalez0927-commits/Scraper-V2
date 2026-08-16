import Link from "next/link";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; ok?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ paddingBottom: 12 }}>
          <span className="brand-mark">S</span>
          <span className="brand-name">Sere</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 28 }}>Sign in</h1>
        <p className="muted">Harbor Air demo: owner@sere.cash / harborair</p>
        {q.error ? <div className="flash flash-error">{q.error}</div> : null}
        {q.ok ? <div className="flash flash-success">{q.ok}</div> : null}
        <form action={loginAction} className="stack">
          <input type="hidden" name="next" value={q.next || "/overview"} />
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button className="btn" type="submit">Sign in</button>
        </form>
        <p><Link href="/forgot">Forgot password</Link></p>
        <p>New shop? <Link href="/signup">Create an account</Link></p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { loginAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { boot } from "@/lib/boot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; ok?: string }>;
}) {
  const q = await searchParams;
  let bootError = "";
  try {
    await boot();
  } catch (error) {
    console.error(error);
    bootError =
      "Sere could not open a database on this host. On Vercel, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then redeploy.";
  }
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ paddingBottom: 12 }}>
          <BrandLogo className="brand-lockup" variant="lockup" />
        </div>
        <h1 className="page-title" style={{ fontSize: 28 }}>Sign in</h1>
        <p className="muted">Harbor Air demo: owner@sere.cash / harborair</p>
        {bootError ? <div className="flash flash-error">{bootError}</div> : null}
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
          <button className="btn" type="submit" disabled={Boolean(bootError)}>Sign in</button>
        </form>
        <p><Link href="/forgot">Forgot password</Link></p>
        <p>New shop? <Link href="/signup">Create an account</Link></p>
      </div>
    </div>
  );
}

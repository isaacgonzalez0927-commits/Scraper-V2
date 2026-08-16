import Link from "next/link";
import { loginAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Banner } from "@/components/ui";
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
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
        </div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Harbor Air demo: owner@sere.cash with password harborair</p>
        <Banner error={bootError || q.error} ok={q.ok} />
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
        <div className="auth-foot">
          <Link href="/forgot">Forgot password</Link>
          <Link href="/signup">Create an account</Link>
        </div>
      </div>
    </div>
  );
}

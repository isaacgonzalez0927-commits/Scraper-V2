import Link from "next/link";
import { loginAction } from "../actions";
import { AuthShell } from "@/components/AuthShell";
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
    <AuthShell
      title="Sign in"
      sub="Your jobs, invoices, and cash."
      foot={
        <>
          <Link href="/forgot">Forgot password</Link>
          <Link href="/signup">Create a shop</Link>
        </>
      }
    >
      <Banner error={bootError || q.error} ok={q.ok} />
      <form action={loginAction} className="stack">
        <input type="hidden" name="next" value={q.next || "/overview"} />
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
            autoComplete="current-password"
            enterKeyHint="go"
          />
        </label>
        <button className="btn btn-block" type="submit" disabled={Boolean(bootError)}>
          Sign in
        </button>
      </form>
      <p className="auth-fine">
        Just looking? <a href="/demo">Open the Harbor Air demo</a> — no account.
      </p>
    </AuthShell>
  );
}

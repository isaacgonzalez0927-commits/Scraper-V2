import Link from "next/link";
import { forgotAction } from "../actions";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; token?: string; error?: string }>;
}) {
  const q = await searchParams;
  return (
    <AuthShell
      title="Reset password"
      sub="The email you sign in with."
      foot={<Link href="/login">Back to sign in</Link>}
    >
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
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            enterKeyHint="go"
          />
        </label>
        <button className="btn btn-block" type="submit">Send reset link</button>
      </form>
    </AuthShell>
  );
}

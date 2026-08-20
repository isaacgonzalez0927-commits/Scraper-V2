import Link from "next/link";
import { resetAction } from "../../actions";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const q = await searchParams;
  return (
    <AuthShell
      title="New password"
      sub="At least 8 characters."
      foot={<Link href="/login">Back to sign in</Link>}
    >
      <Banner error={q.error} />
      <form action={resetAction} className="stack">
        <input type="hidden" name="token" value={token} />
        <label>
          New password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            enterKeyHint="go"
          />
        </label>
        <button className="btn btn-block" type="submit">Update password</button>
      </form>
    </AuthShell>
  );
}

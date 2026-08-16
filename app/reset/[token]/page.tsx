import { resetAction } from "../../actions";
import { BrandLogo } from "@/components/BrandLogo";

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
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ paddingBottom: 28 }}>
          <BrandLogo className="brand-lockup" />
        </div>
        <h1 className="page-title" style={{ fontSize: 28 }}>Choose a new password</h1>
        {q.error ? <div className="flash flash-error">{q.error}</div> : null}
        <form action={resetAction} className="stack">
          <input type="hidden" name="token" value={token} />
          <label>
            New password
            <input name="password" type="password" required minLength={8} />
          </label>
          <button className="btn" type="submit">Update password</button>
        </form>
      </div>
    </div>
  );
}
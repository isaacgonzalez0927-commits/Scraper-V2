import { resetAction } from "../../actions";
import { BrandMark } from "@/components/BrandMark";

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
          <BrandMark className="brand-mark-image" size={40} />
          <span className="brand-name">Sere</span>
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
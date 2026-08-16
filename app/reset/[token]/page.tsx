import { resetAction } from "../../actions";
import { BrandLogo } from "@/components/BrandLogo";
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
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
        </div>
        <h1 className="auth-title">Choose a new password</h1>
        <p className="auth-sub">At least 8 characters.</p>
        <Banner error={q.error} />
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

import Link from "next/link";
import { signupAction } from "../actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
        </div>
        <h1 className="auth-title">Create your shop</h1>
        <p className="auth-sub">Two minutes to your first invoice. No card needed.</p>
        <Banner error={q.error} />
        <form action={signupAction} className="stack">
          <label>
            Shop name
            <input name="company" required />
          </label>
          <label>
            Your name
            <input name="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" required minLength={8} />
          </label>
          <button className="btn" type="submit">Create shop</button>
        </form>
        <div className="auth-foot">
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

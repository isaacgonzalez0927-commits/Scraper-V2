import Link from "next/link";
import { signupAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="page-title" style={{ fontSize: 28 }}>Create your shop</h1>
        {q.error ? <div className="flash flash-error">{q.error}</div> : null}
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
        <p>Already have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </div>
  );
}

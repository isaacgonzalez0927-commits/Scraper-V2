"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="auth-title">Something went wrong</h1>
        <p className="auth-sub">
          The server hit an error while starting Sere. On a fresh Vercel deploy, wait a
          few seconds and try again. Data that survives restarts needs Turso
          (<code>TURSO_DATABASE_URL</code> and <code>TURSO_AUTH_TOKEN</code>).
        </p>
        <button className="btn" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}

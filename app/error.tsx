"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="page-title" style={{ fontSize: 28 }}>Something broke</h1>
        <p className="muted">
          The server hit an error starting Sere. If this is a fresh Vercel deploy,
          wait a few seconds and try again. Persistent data needs Turso
          (<code>TURSO_DATABASE_URL</code> and <code>TURSO_AUTH_TOKEN</code>).
        </p>
        <button className="btn" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}

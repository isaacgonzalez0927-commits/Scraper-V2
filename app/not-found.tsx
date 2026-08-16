export default function NotFound() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="page-title" style={{ fontSize: 28 }}>Not found</h1>
        <p className="muted">That page is not in Sere.</p>
        <a className="btn" href="/overview">Back to overview</a>
      </div>
    </div>
  );
}

export default function NotFound() {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="auth-title">Page not found</h1>
        <p className="auth-sub">That page is not part of Sere.</p>
        <a className="btn" href="/overview">Back to overview</a>
      </div>
    </div>
  );
}

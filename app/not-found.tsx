export default function NotFound() {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="auth-title">Page not found</h1>
        <p className="auth-sub">That address is not a page in Sere. Open sere.cash with nothing after it.</p>
        <a className="btn" href="/">Go to sere.cash</a>
      </div>
    </div>
  );
}

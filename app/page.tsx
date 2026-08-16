import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="brand-mark">S</span>
          <span className="brand-name">Sere</span>
        </div>
        <nav className="hero-actions">
          <Link href="/login">Sign in</Link>
          <Link className="btn" href="/signup">Start</Link>
        </nav>
      </header>
      <section className="hero">
        <p className="tiny">HVAC cash, not theater</p>
        <h1>See what you billed, what you collected, and what is still sitting out there.</h1>
        <p>
          Sere is a simple operating system for HVAC shops. Jobs, invoices, and
          payments stay honest. Cash is never confused with revenue.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/signup">Create your shop</Link>
          <Link className="btn btn-secondary" href="/login">Open demo</Link>
        </div>
        <p className="muted">
          Demo: <code>owner@sere.cash</code> / <code>harborair</code>
        </p>
      </section>
      <section className="points">
        <article className="card">
          <h2>Collected vs billed</h2>
          <p className="muted">Payments are summed from the ledger. An invoice is paid only when the balance is zero.</p>
        </article>
        <article className="card">
          <h2>Jobs to cash</h2>
          <p className="muted">Schedule work, track costs, then draft an invoice from the job in one click.</p>
        </article>
        <article className="card">
          <h2>Your shop only</h2>
          <p className="muted">Every row is scoped to your company. Harbor Air never sees another shop’s books.</p>
        </article>
      </section>
    </div>
  );
}

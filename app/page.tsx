import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { TRADE_LIST } from "@/lib/business";

const POINTS = [
  {
    title: "Cash, not guesses",
    body: "Every payment is a line in the ledger. An invoice turns paid only when the balance hits zero.",
  },
  {
    title: "Job to invoice in one click",
    body: "Schedule the work, log the parts and labor, then bill it without retyping anything.",
  },
  {
    title: "An assistant for the small stuff",
    body: "Sere watches overdue invoices and today's jobs, and can move a date when you ask.",
  },
  {
    title: "Customers pay online",
    body: "Connect the shop's Stripe. Square and PayPal sit underneath if that is what they already use.",
  },
];

const TRADES = TRADE_LIST.filter((trade) => trade.key !== "other").map((trade) => trade.name);

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="Sere">
          <BrandLogo className="brand-lockup" />
        </Link>
        <nav>
          <Link href="/login">Sign in</Link>
          <Link className="btn" href="/signup">Start free</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="hero-copy">
            <h1>Know what you billed, what you collected, and what is still owed.</h1>
            <p className="hero-lede">
              Jobs, invoices, and payments in one place. Built for HVAC, plumbing,
              electrical, and the rest of the trades.
            </p>
            <div className="hero-actions">
              <Link className="btn" href="/signup">Create your shop</Link>
              <a className="btn btn-secondary" href="/demo">Open the demo</a>
            </div>
            <p className="hero-note">Harbor Air in Fort Myers. No sign in.</p>
          </div>

          <div className="hero-preview">
            <div className="preview-app">
              <div className="preview-top">
                <span className="preview-shop">Harbor Air</span>
                <span className="badge">HVAC</span>
              </div>
              <p className="preview-hello">Good afternoon, Elena</p>
              <p className="preview-sub">2 jobs today. INV-1047 is past due.</p>
              <div className="preview-stats">
                <article className="stat-good">
                  <p className="stat-label">Collected</p>
                  <p className="stat-value">$18,420</p>
                </article>
                <article>
                  <p className="stat-label">Outstanding</p>
                  <p className="stat-value">$4,810</p>
                </article>
                <article className="stat-bad">
                  <p className="stat-label">Overdue</p>
                  <p className="stat-value">$1,240</p>
                </article>
              </div>
              <ul className="preview-rows">
                <li>
                  <div>
                    <span className="preview-row-title">Suite 110 no-cool</span>
                    <span className="preview-row-meta">Coastal Dental · Today</span>
                  </div>
                  <span className="badge badge-in_progress">In progress</span>
                </li>
                <li>
                  <div>
                    <span className="preview-row-title">INV-1047</span>
                    <span className="preview-row-meta">Maria Alvarez · 14 days</span>
                  </div>
                  <span className="badge badge-overdue">Overdue</span>
                </li>
                <li>
                  <div>
                    <span className="preview-row-title">Walk-in cooler repair</span>
                    <span className="preview-row-meta">Riverside Property · Tomorrow</span>
                  </div>
                  <span className="badge badge-scheduled">Scheduled</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-points">
          {POINTS.map((point) => (
            <article key={point.title}>
              <h2>{point.title}</h2>
              <p>{point.body}</p>
            </article>
          ))}
        </section>

        <p className="landing-trades">{TRADES.join(" · ")}</p>
      </main>

      <div className="landing-dock">
        <Link className="btn" href="/signup">Create your shop</Link>
        <a className="btn btn-secondary" href="/demo">Open the demo</a>
      </div>
    </div>
  );
}

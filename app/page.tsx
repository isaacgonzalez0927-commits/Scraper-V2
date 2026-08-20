import { Newsreader } from "next/font/google";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { TRADE_LIST } from "@/lib/business";

const display = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-landing",
  weight: ["400", "500", "600"],
});

const POINTS = [
  {
    title: "Cash that actually landed",
    body: "Every card, check, and cash payment is a line in the ledger. An invoice is paid only when the balance hits zero.",
  },
  {
    title: "Job to invoice in one tap",
    body: "Schedule the call, log the parts and labor, then bill it. Nobody retypes the work.",
  },
  {
    title: "Ask it to move Friday",
    body: "Overdue cash and today's jobs sit up top. Say “move the Johnson job to Friday” and it does.",
  },
  {
    title: "See the cash in Stripe or Square",
    body: "Tap Open Stripe keys or Open Square keys, paste, and Overview shows what actually landed.",
  },
];

const TRADES = TRADE_LIST.filter((trade) => trade.key !== "other").map((trade) => trade.name);

export default function LandingPage() {
  return (
    <div className={`landing ${display.variable}`}>
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
            <h1>What you billed. What came in. What is still owed.</h1>
            <p className="hero-lede">
              Sere is the book for a local shop. Jobs, invoices, and payments stay
              together, so the number on the screen is the number in the bank.
            </p>
            <div className="hero-actions">
              <Link className="btn" href="/signup">Create your shop</Link>
              <a className="btn btn-secondary" href="/demo">Try Harbor Air</a>
            </div>
            <p className="hero-note">HVAC shop in Fort Myers. Open it with no account.</p>
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
        <a className="btn btn-secondary" href="/demo">Try Harbor Air</a>
      </div>
    </div>
  );
}

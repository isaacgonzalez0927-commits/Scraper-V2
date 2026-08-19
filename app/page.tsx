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
    title: "An assistant that does the small stuff",
    body: "Sere watches overdue invoices and today's jobs, and can move a date when you ask.",
  },
  {
    title: "Get paid online",
    body: "Connect the shop's Stripe. Square and PayPal are there too if that is what they already use.",
  },
];

const TRADES = TRADE_LIST.filter((trade) => trade.key !== "other")
  .map((trade) => trade.name)
  .join(", ");

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <BrandLogo className="brand-lockup" />
        </div>
        <nav>
          <Link href="/login">Sign in</Link>
          <Link className="btn" href="/signup">Start free</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero">
          <p className="hero-eyebrow">For local service shops</p>
          <h1>Know what you billed, what you collected, and what is still owed.</h1>
          <p className="hero-lede">
            Jobs, invoices, and payments in one place, so the number on the screen is
            the number in the bank.
          </p>
          <div className="hero-actions">
            <Link className="btn" href="/signup">Create your shop</Link>
            <a className="btn btn-secondary" href="/demo">Open the demo</a>
          </div>
          <p className="hero-note">
            Harbor Air HVAC in Fort Myers. Open it with no sign in.
          </p>
        </section>

        <ol className="landing-points">
          {POINTS.map((point, index) => (
            <li key={point.title}>
              <span className="landing-num">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{point.title}</h2>
                <p>{point.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="landing-trades">{TRADES}.</p>
      </main>

      <div className="landing-dock">
        <Link className="btn" href="/signup">Create your shop</Link>
        <a className="btn btn-secondary" href="/demo">Open the demo</a>
      </div>
    </div>
  );
}

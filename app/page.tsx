import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Card } from "@/components/ui";
import { TRADE_LIST } from "@/lib/business";

const POINTS = [
  {
    icon: "💰",
    title: "Cash, not guesses",
    body: "Every payment is a line in the ledger. An invoice turns paid only when the balance hits zero.",
  },
  {
    icon: "⚡",
    title: "Job to invoice in one click",
    body: "Schedule the work, log the parts and labor, then bill it without retyping anything.",
  },
  {
    icon: "✨",
    title: "An assistant that does the small stuff",
    body: "Sere watches overdue invoices and today's jobs, and can move a date when you ask.",
  },
  {
    icon: "💳",
    title: "Get paid online",
    body: "Connect the shop's own Stripe account. Card payments land in their bank, not yours.",
  },
];

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

      <section className="hero">
        <p className="hero-eyebrow">For local service businesses</p>
        <h1>Know what you billed, what you collected, and what is still owed.</h1>
        <p className="hero-lede">
          Sere keeps jobs, invoices, and payments in one place, so the number on your
          screen is the number in the bank. Built for HVAC, plumbing, electrical, and
          the rest of the trades.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/signup">Create your shop</Link>
          <a className="btn btn-secondary" href="/demo">Open the demo</a>
        </div>
        <p className="hero-note">
          Two minutes to a shop that speaks your trade. Or open the Harbor Air HVAC demo,
          no sign in.
        </p>
        <ul className="trade-strip">
          {TRADE_LIST.filter((t) => t.key !== "other").map((trade) => (
            <li key={trade.key}>{trade.name}</li>
          ))}
        </ul>
      </section>

      <div className="landing-dock">
        <Link className="btn btn-primary-large" href="/signup">Create your shop</Link>
        <a className="btn btn-secondary" href="/demo">Open the demo</a>
      </div>

      <section className="landing-grid landing-grid-4">
        {POINTS.map((point) => (
          <Card key={point.title} title={point.title}>
            <div className="feature-icon">{point.icon}</div>
            <p className="muted">{point.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

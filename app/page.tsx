import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Card } from "@/components/ui";

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
    title: "Get paid online",
    body: "Connect your own Stripe account and your customers can pay the invoice by card or bank.",
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
        <p className="hero-eyebrow">Built for HVAC shops</p>
        <h1>Know what you billed, what you collected, and what is still owed.</h1>
        <p className="hero-lede">
          Sere keeps jobs, invoices, and payments in one place, so the number on your
          screen is the number in your bank account.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/signup">Create your shop</Link>
          {/* A route handler, not a page, so keep it a plain anchor and skip prefetch. */}
          <a className="btn btn-secondary" href="/demo">Open the demo</a>
        </div>
        <p className="hero-note">
          The demo opens a real shop with a month of jobs, invoices, and payments.
          No sign in, no email, nothing to fill in.
        </p>
      </section>

      <section className="landing-grid">
        {POINTS.map((point) => (
          <Card key={point.title} title={point.title}>
            <p className="muted">{point.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

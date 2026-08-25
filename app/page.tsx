import { Newsreader } from "next/font/google";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectSereButton } from "@/components/ConnectSere";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TRADE_LIST } from "@/lib/business";
import { IPHONE_PATH } from "@/lib/iphone";
import { formatPlanPrice, PLANS, PRICING_NOTE, signupHref } from "@/lib/pricing";

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
    title: "Estimate to paid without retyping",
    body: "Get approval, turn the estimate into a job, finish the work, then invoice it from the same record.",
  },
  {
    title: "Ask it to move Friday",
    body: "Overdue cash and today's jobs sit up top. Say “move the Johnson job to Friday” and it does.",
  },
  {
    title: "See the cash in Stripe or Square",
    body: "Create a restricted key in Stripe, paste it on Overview. Then you see what actually landed.",
  },
];

const TRADES = TRADE_LIST.filter((trade) => trade.key !== "other").map((trade) => trade.name);

const HOW_IT_WORKS = [
  {
    title: "Open the working shop",
    body: "Harbor Air is real sample data, not a slideshow. Click through customers, estimates, jobs, invoices, and cash.",
  },
  {
    title: "Try Shop with your shop",
    body: "Create your shop in Sandbox and use the office book for 14 days. No card or setup call.",
  },
  {
    title: "Keep the plan that fits",
    body: "Stay on Shop, or upgrade to Crew or Pro. Your customers, work, and ledger stay in the same book.",
  },
  {
    title: "Go live when you are ready",
    body: "Connect a restricted Stripe key or Square, or use Desk mode for manual payments. Practice data stays.",
  },
];

const BUYING_ANSWERS = [
  {
    title: "Do I need a meeting?",
    body: "No. Open the demo, create your shop, and connect your own processor when you are ready.",
  },
  {
    title: "Does Sere hold my money?",
    body: "No. Customers pay your Stripe, Square, or PayPal account. Sere does not take a cut.",
  },
  {
    title: "What happens after day 14?",
    body: "The Shop trial becomes read-only until you stay on Shop or choose Crew or Pro. Nothing is deleted.",
  },
  {
    title: "Can I take my data out?",
    body: "Yes. Export jobs, invoices, and payments as CSV. There is no annual lock.",
  },
];

export default function LandingPage() {
  return (
    <div className={`landing ${display.variable}`}>
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="Sere">
          <BrandLogo className="brand-lockup" />
        </Link>
        <nav>
          <ThemeToggle />
          <a href="#pricing">Pricing</a>
          <Link href={IPHONE_PATH}>iPhone</Link>
          <Link href="/login">Sign in</Link>
          <ConnectSereButton label="Try Shop free" />
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="hero-copy">
            <h1>What you billed. What came in. What is still owed.</h1>
            <p className="hero-lede">
              Sere is the book for a local shop. Customers, estimates, jobs,
              invoices, and payments stay together, so the number on the screen
              is the number in the bank.
            </p>
            <div className="hero-actions">
              <ConnectSereButton label="Start Shop trial" />
              <a className="btn btn-connect btn-secondary" href="/demo">Try Harbor Air</a>
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

        <section className="landing-pricing" id="how-it-works">
          <div className="landing-pricing-head">
            <h2>See it, try it, choose</h2>
            <p>The product does the explaining. No discovery call and no waiting for a walkthrough.</p>
          </div>
          <div className="landing-points mt-2">
            {HOW_IT_WORKS.map((step) => (
              <article key={step.title}>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="landing-pricing-head">
            <h2>What it costs</h2>
            <p>
              Shop is a complete office book, not a stripped trial plan. Crew
              gives a small team room to work. Pro adds the dispatch and customer
              automation growing shops usually pay much more for. The 14-day
              free trial is Shop. Crew and Pro are upgrades after.
            </p>
          </div>
          <div className="plan-grid">
            {PLANS.map((plan) => (
              <article
                key={plan.key}
                className={
                  plan.featured ? "plan plan-featured" : "plan"
                }
              >
                {plan.featured ? (
                  <p className="plan-kicker">14-day trial plan</p>
                ) : null}
                <h3 className="plan-name">{plan.name}</h3>
                <p className="plan-price">
                  {formatPlanPrice(plan)}
                  {plan.price > 0 ? <span> / month</span> : null}
                </p>
                <p className="plan-seat">{plan.priceNote}</p>
                <p className="plan-blurb">{plan.blurb}</p>
                <ul className="plan-features">
                  {plan.features.map((item) => (
                    <li key={item.text} className={item.soon ? "soon" : undefined}>
                      {item.text}
                      {item.soon ? <span className="plan-soon"> Next</span> : null}
                    </li>
                  ))}
                </ul>
                <Link
                  className={plan.featured ? "btn" : "btn btn-secondary"}
                  href={signupHref(plan)}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
          <p className="landing-pricing-note">{PRICING_NOTE}</p>
        </section>

        <section className="landing-pricing">
          <div className="landing-pricing-head">
            <h2>Before you open your shop</h2>
          </div>
          <div className="landing-points mt-2">
            {BUYING_ANSWERS.map((item) => (
              <article key={item.title}>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <p className="landing-trades">{TRADES.join(" · ")}</p>
        <p className="landing-legal">
          <Link href={IPHONE_PATH}>iPhone</Link>
          <span aria-hidden="true"> · </span>
          <a href="/terms">Terms</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy">Privacy</a>
        </p>
      </main>

      <div className="landing-dock">
        <ConnectSereButton label="Start Shop trial" />
        <a className="btn btn-connect btn-secondary" href="/demo">Try Harbor Air</a>
      </div>
    </div>
  );
}

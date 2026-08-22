import Link from "next/link";
import { Newsreader } from "next/font/google";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  IPHONE_DEMO_HREF,
  IPHONE_OPEN_HREF,
  IPHONE_STORE_URL,
  iphoneCopy,
  iphoneHomeScreenSteps,
} from "@/lib/iphone";

const display = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-landing",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Sere for iPhone",
  description: "Open Sere on your iPhone. Same login. Same book.",
};

export default function IphonePage() {
  const copy = iphoneCopy();
  const primaryHref = IPHONE_STORE_URL || IPHONE_OPEN_HREF;
  const primaryLabel = IPHONE_STORE_URL ? "Get on the App Store" : "Open Sere";
  return (
    <div className={`landing ${display.variable}`}>
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="Sere">
          <BrandLogo className="brand-lockup" />
        </Link>
        <nav>
          <ThemeToggle />
          <Link href="/login">Sign in</Link>
        </nav>
      </header>
      <main className="iphone-shell">
        <div className="iphone-mark" aria-hidden="true">
          <BrandLogo crop="icon" className="iphone-mark-logo" />
        </div>
        <h1>Sere for iPhone</h1>
        <p className="iphone-lede">{copy[0]}</p>
        <a className="btn iphone-cta" href={primaryHref}>
          {primaryLabel}
        </a>
        <p className="iphone-fine">{copy[1]}</p>

        <section className="iphone-card">
          <p className="iphone-card-kicker">{copy[2]}</p>
          <ol>
            {iphoneHomeScreenSteps().map((step, i) => (
              <li key={step}>
                <span>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <p className="iphone-demo">
          Just looking? <a href={IPHONE_DEMO_HREF}>See a live shop</a>
        </p>
        <p className="landing-legal">
          <Link href="/">Home</Link>
          <span aria-hidden="true"> · </span>
          <a href="/terms">Terms</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy">Privacy</a>
        </p>
      </main>
    </div>
  );
}

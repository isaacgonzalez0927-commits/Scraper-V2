import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  IPHONE_DEMO_HREF,
  IPHONE_OPEN_HREF,
  IPHONE_STORE_URL,
  iphoneCopy,
  iphoneHomeScreenSteps,
} from "@/lib/iphone";

export const metadata = {
  title: "Sere for iPhone",
  description: "Open Sere on your iPhone. Add it to the home screen. The App Store wrapper comes later.",
};

export default function IphonePage() {
  const copy = iphoneCopy();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="Sere">
          <BrandLogo className="brand-lockup" />
        </Link>
        <nav>
          <ThemeToggle />
          <Link href="/login">Sign in</Link>
        </nav>
      </header>
      <main className="landing-main iphone-page">
        <section className="hero">
          <div className="hero-copy">
            <h1>Sere on your iPhone</h1>
            <p className="hero-lede">{copy[0]}</p>
            <div className="hero-actions">
              {IPHONE_STORE_URL ? (
                <a className="btn" href={IPHONE_STORE_URL}>
                  Get on the App Store
                </a>
              ) : (
                <a className="btn" href={IPHONE_OPEN_HREF}>
                  Open Sere
                </a>
              )}
              <a className="btn btn-secondary" href={IPHONE_DEMO_HREF}>
                Try Harbor Air
              </a>
            </div>
            <p className="hero-note">{copy[1]}</p>
          </div>
        </section>

        <section className="landing-points">
          <article>
            <h2>Keep it on the home screen</h2>
            <p>{copy[2]}</p>
            <ol className="iphone-steps">
              {iphoneHomeScreenSteps().map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
          <article>
            <h2>App Store</h2>
            <p>{copy[3]}</p>
          </article>
        </section>

        <p className="landing-legal">
          <Link href="/">Home</Link>
          <span aria-hidden="true"> · </span>
          <a href="/terms">Terms</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy">Privacy</a>
        </p>
      </main>
      <div className="landing-dock">
        <a className="btn" href={IPHONE_STORE_URL || IPHONE_OPEN_HREF}>
          {IPHONE_STORE_URL ? "Get on the App Store" : "Open Sere"}
        </a>
        <a className="btn btn-secondary" href={IPHONE_DEMO_HREF}>
          Try Harbor Air
        </a>
      </div>
    </div>
  );
}

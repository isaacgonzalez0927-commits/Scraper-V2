import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { LEGAL_EFFECTIVE, LEGAL_OPERATOR, LEGAL_PRODUCT, LEGAL_SITE } from "@/lib/legal";

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: { id: string; title: string; body: string[] }[];
}) {
  return (
    <div className="legal">
      <header className="legal-nav">
        <Link href="/" className="brand" aria-label="Sere">
          <BrandLogo className="brand-lockup" />
        </Link>
        <nav>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/signup">Create a shop</Link>
        </nav>
      </header>
      <main className="legal-main">
        <p className="legal-kicker">
          {LEGAL_PRODUCT} · Effective {LEGAL_EFFECTIVE}
        </p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-meta">
          These terms are between you and {LEGAL_OPERATOR} ({LEGAL_SITE}). They are
          the contract for the service. They are not a substitute for advice from
          a lawyer licensed in your state.
        </p>
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2>{section.title}</h2>
            {section.body.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

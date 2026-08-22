import { LegalPage } from "@/components/LegalPage";
import { LEGAL_EFFECTIVE, TERMS_SECTIONS } from "@/lib/legal";

export const metadata = {
  title: "Terms of Service · Sere",
  description: "The contract for using Sere, the shop book at sere.cash.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`Last updated ${LEGAL_EFFECTIVE}. By creating a shop or using Sere, you agree to these Terms and the Privacy Policy.`}
      sections={TERMS_SECTIONS}
    />
  );
}

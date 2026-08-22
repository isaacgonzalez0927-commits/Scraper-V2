import { LegalPage } from "@/components/LegalPage";
import { LEGAL_EFFECTIVE, PRIVACY_SECTIONS } from "@/lib/legal";

export const metadata = {
  title: "Privacy Policy · Sere",
  description: "What Sere collects, how it is used, and how to ask for an export or deletion.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`Last updated ${LEGAL_EFFECTIVE}. This policy explains what Sere collects when you run a shop, and what we do not do with it.`}
      sections={PRIVACY_SECTIONS}
    />
  );
}

import { SereSetupTutorial } from "@/components/SereSetupTutorial";
import { AuthShell } from "@/components/AuthShell";
import { requireContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { tradeCopy } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await boot();
  const { user, org } = await requireContext();
  const voice = tradeCopy(org.businessType);
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return (
    <AuthShell
      title={`How Sere works, ${firstName}`}
      sub="A short walkthrough, the same way Stripe walks you through a restricted key. Then the book is yours."
      wide
    >
      <SereSetupTutorial voice={voice} showOpenBook />
    </AuthShell>
  );
}

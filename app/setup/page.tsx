import { and, desc, eq, isNull } from "drizzle-orm";
import { SereSetupWizard } from "@/components/SereSetupWizard";
import { AuthShell } from "@/components/AuthShell";
import { requireContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { tradeCopy } from "@/lib/business";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/integrations";
import { customers, jobs } from "@/lib/schema";
import { parseSetupIntent, resolveSetupStep } from "@/lib/sere-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; intent?: string; error?: string; ok?: string }>;
}) {
  await boot();
  const { org } = await requireContext();
  const q = await searchParams;
  const voice = tradeCopy(org.businessType);
  const [customerRows, jobRows, integrations] = await Promise.all([
    db()
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)))
      .orderBy(desc(customers.id))
      .limit(1),
    db()
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.organizationId, org.id))
      .orderBy(desc(jobs.id))
      .limit(1),
    integrationStatus(org.id),
  ]);
  const step = resolveSetupStep(q.step, {
    customers: customerRows.length,
    jobs: jobRows.length,
    stripe: integrations.stripe.connected,
  });
  const latest = customerRows[0];
  return (
    <AuthShell wide>
      <SereSetupWizard
        step={step}
        intent={parseSetupIntent(q.intent)}
        voice={voice}
        error={q.error}
        ok={q.ok}
        customerId={latest?.id}
        customerName={latest?.name}
        jobTitle={jobRows[0]?.title}
      />
    </AuthShell>
  );
}

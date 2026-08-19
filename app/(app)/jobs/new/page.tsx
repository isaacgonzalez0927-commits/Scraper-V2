import { and, eq, isNull } from "drizzle-orm";
import { JobForm } from "@/components/JobForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers } from "@/lib/schema";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; start?: string; error?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const q = await searchParams;
  const customerRows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)));
  return (
    <Shell
      {...shell}
      path="/jobs"
      title="New job"
      sub={<p className="page-sub">Pick the customer, then say what the work is.</p>}
      actions={<a className="btn btn-secondary" href="/jobs">Cancel</a>}
    >
      <JobForm
        customerRows={customerRows}
        error={q.error}
        jobPlaceholder={voice.jobPlaceholder}
        workerLabel={voice.worker}
        job={{
          customerId: q.customerId ? Number(q.customerId) : undefined,
          scheduledStart: q.start || null,
        }}
      />
    </Shell>
  );
}

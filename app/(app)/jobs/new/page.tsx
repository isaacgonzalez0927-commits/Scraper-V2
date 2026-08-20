import { and, eq, isNull } from "drizzle-orm";
import { JobForm } from "@/components/JobForm";
import { Shell } from "@/components/Shell";
import { tradeFieldsFor } from "@/lib/business";
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
      title={voice.newJob}
      sub={<p className="page-sub">{voice.newJobSub}</p>}
      actions={<a className="btn btn-secondary" href="/jobs">Cancel</a>}
    >
      <JobForm
        customerRows={customerRows}
        error={q.error}
        voice={voice}
        fields={tradeFieldsFor(org.businessType, "job")}
        job={{
          customerId: q.customerId ? Number(q.customerId) : undefined,
          scheduledStart: q.start || null,
        }}
      />
    </Shell>
  );
}

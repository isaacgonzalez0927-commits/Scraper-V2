import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/JobForm";
import { Shell } from "@/components/Shell";
import { tradeFieldsFor } from "@/lib/business";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers, jobs } from "@/lib/schema";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, shell, voice } = await loadApp();
  const { id } = await params;
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, Number(id)), eq(jobs.organizationId, org.id)));
  if (!job) notFound();
  const customerRows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)));
  return (
    <Shell
      {...shell}
      path="/jobs"
      title={`Edit ${job.title}`}
      actions={<a className="btn btn-secondary" href={`/jobs/${job.id}`}>Cancel</a>}
    >
      <JobForm
        job={job}
        customerRows={customerRows}
        voice={voice}
        fields={tradeFieldsFor(org.businessType, "job")}
      />
    </Shell>
  );
}

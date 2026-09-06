import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/JobForm";
import { Shell } from "@/components/Shell";
import { tradeFieldsFor } from "@/lib/business";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { listProperties } from "@/lib/properties";
import { customers, jobs } from "@/lib/schema";
import { getCrew } from "@/lib/operations";

export default async function EditJobPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{error?:string}> }) {
  const { org, shell, voice } = await loadApp();
  const { id } = await params;
  const q=await searchParams;
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, Number(id)), eq(jobs.organizationId, org.id)));
  if (!job) notFound();
  const customerRows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)));
  const propertyRows = await listProperties(org.id, job.customerId);
  const crewRows=await getCrew(org.id);
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
        propertyRows={propertyRows}
        voice={voice}
        fields={tradeFieldsFor(org.businessType, "job")}
        crewRows={crewRows}
        error={q.error}
      />
    </Shell>
  );
}

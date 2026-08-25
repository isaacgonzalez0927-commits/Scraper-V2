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
  const selectedCustomer = q.customerId
    ? customerRows.find((customer) => customer.id === Number(q.customerId))
    : undefined;
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
          customerId: selectedCustomer?.id,
          scheduledStart: q.start || null,
          serviceLine1: selectedCustomer?.serviceLine1,
          serviceCity: selectedCustomer?.serviceCity,
          serviceState: selectedCustomer?.serviceState,
          servicePostal: selectedCustomer?.servicePostal,
        }}
      />
    </Shell>
  );
}

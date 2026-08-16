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
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const customerRows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)));
  return (
    <Shell {...shell} path="/jobs" title="New job">
      <JobForm
        customerRows={customerRows}
        error={q.error}
        job={{
          customerId: q.customerId ? Number(q.customerId) : undefined,
          scheduledStart: q.start || null,
        }}
      />
    </Shell>
  );
}

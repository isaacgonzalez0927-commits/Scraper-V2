import { and, eq } from "drizzle-orm";
import { Badge, Blank, Empty, RecordTable, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { JOB_STATUSES, label, prettyWhen } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { customers, jobs } from "@/lib/schema";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { status } = await searchParams;
  const filters = [eq(jobs.organizationId, org.id)];
  if (status) filters.push(eq(jobs.status, status));
  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(...filters));

  const tabs = [
    { key: "", name: "All", href: "/jobs" },
    ...JOB_STATUSES.map((s) => ({ key: s, name: label(s), href: `/jobs?status=${s}` })),
  ];

  return (
    <Shell
      {...shell}
      path="/jobs"
      title="Jobs"
      sub={<p className="page-sub">{voice.jobsSub}</p>}
      actions={
        <>
          <a className="btn btn-secondary" href="/api/export/jobs">Export CSV</a>
          <a className="btn" href="/jobs/new">New job</a>
        </>
      }
    >
      <Tabs tabs={tabs} active={status || ""} />
      {rows.length ? (
        <RecordTable
          columns={[
            { label: "Job" },
            { label: "Customer" },
            { label: "Scheduled" },
            { label: voice.worker },
            { label: "Status" },
            { label: "Est. revenue", align: "right" },
          ]}
          records={rows.map(({ job, customer }) => ({
            key: job.id,
            href: `/jobs/${job.id}`,
            cells: [
              <a className="rowlink" href={`/jobs/${job.id}`}>{job.title}</a>,
              displayName(customer),
              prettyWhen(job.scheduledStart) || <Blank text="Unscheduled" />,
              job.technicianName || <Blank text="Unassigned" />,
              <Badge status={job.status} />,
              <span className="money">{formatMoney(job.estimatedRevenueCents)}</span>,
            ],
            phone: {
              title: job.title,
              meta: `${displayName(customer)} · ${prettyWhen(job.scheduledStart) || "Unscheduled"}`,
              badge: <Badge status={job.status} />,
              amount: formatMoney(job.estimatedRevenueCents),
              amountNote: "estimate",
            },
          }))}
        />
      ) : (
        <Empty
          title="No jobs on this list"
          body={voice.emptyJobs}
          href="/jobs/new"
          action="New job"
        />
      )}
    </Shell>
  );
}

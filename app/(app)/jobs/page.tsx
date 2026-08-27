import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { Badge, Blank, Empty, RecordTable, SearchField, Tabs } from "@/components/ui";
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
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { status, q } = await searchParams;
  const term = (q || "").trim();
  const filters = [eq(jobs.organizationId, org.id)];
  if (status && JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
    filters.push(eq(jobs.status, status));
  }
  if (term) {
    const likeTerm = `%${term.replace(/[%_]/g, "")}%`;
    filters.push(
      or(
        like(jobs.title, likeTerm),
        like(jobs.description, likeTerm),
        like(jobs.technicianName, likeTerm),
        like(customers.name, likeTerm),
        like(customers.companyName, likeTerm),
        like(customers.email, likeTerm),
        like(customers.phone, likeTerm),
      )!,
    );
  }
  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(
      customers,
      and(eq(customers.id, jobs.customerId), eq(customers.organizationId, org.id)),
    )
    .where(and(...filters))
    .orderBy(sql`${jobs.scheduledStart} IS NULL`, asc(jobs.scheduledStart), desc(jobs.createdAt));

  const tabs = [
    { key: "", name: "All", href: "/jobs" },
    ...JOB_STATUSES.map((s) => ({ key: s, name: label(s), href: `/jobs?status=${s}` })),
  ];

  return (
    <Shell
      {...shell}
      path="/jobs"
      title={voice.jobs}
      sub={<p className="page-sub">{voice.jobsSub}</p>}
      actions={
        <>
          <a className="btn btn-secondary" href="/api/export/jobs">Export CSV</a>
          <a className="btn" href="/jobs/new">{voice.newJob}</a>
        </>
      }
    >
      <div className="toolbar">
        <Tabs tabs={tabs} active={status || ""} />
        <SearchField
          value={term}
          placeholder={`${voice.job}, ${voice.customer.toLowerCase()}, or ${voice.worker.toLowerCase()}`}
          hidden={status ? { status } : undefined}
        />
      </div>
      {rows.length ? (
        <RecordTable
          columns={[
            { label: voice.job },
            { label: voice.customer },
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
          title={term ? `No ${voice.jobs.toLowerCase()} matched that search` : `No ${voice.jobs.toLowerCase()} on this list`}
          body={term ? "Try a customer name, phone number, job, or worker." : voice.emptyJobs}
          href="/jobs/new"
          action={voice.newJob}
        />
      )}
    </Shell>
  );
}

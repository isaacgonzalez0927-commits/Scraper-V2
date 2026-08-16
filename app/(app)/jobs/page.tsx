import { and, eq } from "drizzle-orm";
import { Badge, Empty } from "@/components/ui";
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
  const { org, shell } = await loadApp();
  const { status } = await searchParams;
  const filters = [eq(jobs.organizationId, org.id)];
  if (status) filters.push(eq(jobs.status, status));
  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(...filters));

  return (
    <Shell
      {...shell}
      path="/jobs"
      title="Jobs"
      actions={<a className="btn" href="/jobs/new">New job</a>}
    >
      <div className="filters">
        <a className={`chip ${status ? "" : "active"}`} href="/jobs">All</a>
        {JOB_STATUSES.map((s) => (
          <a key={s} className={`chip ${status === s ? "active" : ""}`} href={`/jobs?status=${s}`}>
            {label(s)}
          </a>
        ))}
      </div>
      {rows.length ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>When</th>
                <th>Tech</th>
                <th>Status</th>
                <th className="right">Est. revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, customer }) => (
                <tr key={job.id}>
                  <td><a className="rowlink" href={`/jobs/${job.id}`}>{job.title}</a></td>
                  <td>{displayName(customer)}</td>
                  <td>{prettyWhen(job.scheduledStart)}</td>
                  <td>{job.technicianName || "—"}</td>
                  <td><Badge status={job.status} /></td>
                  <td className="right money">{formatMoney(job.estimatedRevenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No jobs on this list"
          body="Schedule the next call or mark a walk-in as in progress."
          href="/jobs/new"
          action="New job"
        />
      )}
    </Shell>
  );
}

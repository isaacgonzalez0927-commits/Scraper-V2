import { and, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { Badge, Money } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { prettyWhen } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import {
  collectedCents,
  invoicedRevenueCents,
  isoDate,
  jobCostTotal,
  jobRevenueCents,
  monthBounds,
  outstandingTotals,
  weekBounds,
} from "@/lib/queries";
import { activities, customers, invoices, jobs } from "@/lib/schema";

export default async function OverviewPage() {
  const { org, shell } = await loadApp();
  const month = monthBounds();
  const week = weekBounds();
  const today = isoDate(new Date());
  const [revenue, collected, { outstanding, overdue }, jobRows, activity, invoiceRows] = await Promise.all([
    invoicedRevenueCents(org.id, month.start, month.end),
    collectedCents(org.id, month.start, month.end),
    outstandingTotals(org.id),
    db()
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(eq(jobs.organizationId, org.id)),
    db()
      .select()
      .from(activities)
      .where(eq(activities.organizationId, org.id))
      .orderBy(desc(activities.createdAt))
      .limit(8),
    db().select().from(invoices).where(eq(invoices.organizationId, org.id)),
  ]);

  const jobsToday = jobRows.filter((r) => r.job.scheduledStart?.slice(0, 10) === today);
  const jobsWeek = jobRows.filter((r) => {
    const day = r.job.scheduledStart?.slice(0, 10);
    return day && day >= week.start && day <= week.end;
  });
  const awaiting = jobRows
    .filter((r) => r.job.status === "scheduled" || r.job.status === "in_progress")
    .slice(0, 6);
  const recentDone = jobRows.filter((r) => r.job.status === "completed").slice(0, 4);

  let profit = 0;
  for (const { job } of jobRows) {
    if (!["scheduled", "in_progress", "completed"].includes(job.status)) continue;
    const stamp = (job.completedAt || job.scheduledStart || "").slice(0, 10);
    if (!stamp || stamp < month.start || stamp > month.end) continue;
    const cost = await jobCostTotal(org.id, job.id, job.estimatedCostCents);
    profit += jobRevenueCents(job) - cost;
  }

  const invoiceCounts: Record<string, number> = {};
  for (const invoice of invoiceRows) {
    invoiceCounts[invoice.status] = (invoiceCounts[invoice.status] || 0) + 1;
  }

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <Shell
      {...shell}
      path="/overview"
      title="Overview"
      sub={<p className="page-sub">{monthLabel} — what came in, what is still out, and what is on the board.</p>}
      actions={<a className="btn" href="/jobs/new">New job</a>}
    >
      <section className="grid grid-5">
        <article className="card">
          <p className="stat-label">Revenue this month</p>
          <p className="stat-value money">{formatMoney(revenue)}</p>
          <p className="stat-note">Invoiced, not necessarily collected</p>
        </article>
        <article className="card stat-good">
          <p className="stat-label">Collected this month</p>
          <p className="stat-value money">{formatMoney(collected)}</p>
          <p className="stat-note">Payments actually received</p>
        </article>
        <article className="card">
          <p className="stat-label">Outstanding</p>
          <p className="stat-value money">{formatMoney(outstanding)}</p>
          <p className="stat-note">Open invoice balances</p>
        </article>
        <article className="card stat-bad">
          <p className="stat-label">Overdue</p>
          <p className="stat-value money">{formatMoney(overdue)}</p>
          <p className="stat-note">Past due and still unpaid</p>
        </article>
        <article className="card stat-accent">
          <p className="stat-label">Estimated profit</p>
          <p className="stat-value money">{formatMoney(profit)}</p>
          <p className="stat-note">This month’s jobs, revenue minus costs</p>
        </article>
      </section>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Jobs</div>
          <ul className="list">
            <li><span>Today</span><strong>{jobsToday.length}</strong></li>
            <li><span>This week</span><strong>{jobsWeek.length}</strong></li>
          </ul>
          <h3 className="tiny" style={{ margin: "16px 0 8px" }}>Awaiting completion</h3>
          {awaiting.length ? (
            <ul className="list">
              {awaiting.map(({ job, customer }) => (
                <li key={job.id}>
                  <div>
                    <a className="rowlink" href={`/jobs/${job.id}`}>{job.title}</a>
                    <div className="tiny">{displayName(customer)} · {job.status.replace("_", " ")}</div>
                  </div>
                  <span className="tiny">{prettyWhen(job.scheduledStart)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing waiting. Enjoy the quiet.</p>
          )}
          <h3 className="tiny" style={{ margin: "16px 0 8px" }}>Recently completed</h3>
          {recentDone.length ? recentDone.map(({ job, customer }) => (
            <div className="tiny" key={job.id} style={{ padding: "6px 0" }}>
              <a href={`/jobs/${job.id}`}>{job.title}</a> — {displayName(customer)}
            </div>
          )) : <p className="muted">No completed jobs yet.</p>}
        </section>

        <section className="card">
          <div className="card-title">Invoices</div>
          <div className="filters">
            {Object.entries(invoiceCounts).map(([key, count]) => (
              <a className="chip" key={key} href={`/invoices?status=${key}`}>
                {key} · {count}
              </a>
            ))}
          </div>
          <div className="card-title" style={{ marginTop: 18 }}>Recent activity</div>
          {activity.length ? (
            <ul className="list">
              {activity.map((item) => (
                <li key={item.id}>
                  <div>
                    <a href={item.link || "/overview"}>{item.title}</a>
                    <div className="tiny">{prettyWhen(item.createdAt)}</div>
                  </div>
                  {item.amountCents != null ? <Money cents={item.amountCents} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <h3>Your day will show up here</h3>
              <p>Create a customer, schedule a job, or send an invoice.</p>
              <a className="btn" href="/customers/new">Add a customer</a>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

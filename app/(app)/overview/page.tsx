import { desc, eq } from "drizzle-orm";
import { Badge, Card, Money, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { label, prettyWhen } from "@/lib/labels";
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
      sub={<p className="page-sub">{monthLabel}. What came in, what is still out, and what is on the board.</p>}
      actions={<a className="btn" href="/jobs/new">New job</a>}
    >
      <section className="grid grid-5">
        <Stat
          label="Collected this month"
          value={formatMoney(collected)}
          note="Payments that actually landed"
          tone="good"
        />
        <Stat label="Invoiced this month" value={formatMoney(revenue)} note="Billed, not yet cash" />
        <Stat label="Outstanding" value={formatMoney(outstanding)} note="Open invoice balances" />
        <Stat label="Overdue" value={formatMoney(overdue)} note="Past due and unpaid" tone="bad" />
        <Stat
          label="Estimated profit"
          value={formatMoney(profit)}
          note="This month, revenue less costs"
          tone="accent"
        />
      </section>

      <div className="grid grid-2 mt-2">
        <Card
          title="Jobs on the board"
          action={<a className="btn btn-secondary btn-sm" href="/jobs">View all</a>}
        >
          <ul className="list">
            <li><span className="muted">Today</span><strong>{jobsToday.length}</strong></li>
            <li><span className="muted">This week</span><strong>{jobsWeek.length}</strong></li>
            <li><span className="muted">Waiting to finish</span><strong>{awaiting.length}</strong></li>
          </ul>
          <p className="section-label mt-2">Next up</p>
          {awaiting.length ? (
            <ul className="list">
              {awaiting.map(({ job, customer }) => (
                <li key={job.id}>
                  <div>
                    <a className="rowlink" href={`/jobs/${job.id}`}>{job.title}</a>
                    <div className="tiny">{displayName(customer)}</div>
                  </div>
                  <div className="row">
                    <span className="tiny">{prettyWhen(job.scheduledStart)}</span>
                    <Badge status={job.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing waiting. Enjoy the quiet.</p>
          )}
        </Card>

        <Card
          title="Recent activity"
          action={<a className="btn btn-secondary btn-sm" href="/invoices">Invoices</a>}
        >
          <div className="row">
            {Object.entries(invoiceCounts).map(([key, count]) => (
              <a className="badge" key={key} href={`/invoices?status=${key}`}>
                {label(key)} {count}
              </a>
            ))}
          </div>
          {activity.length ? (
            <ul className="list mt-2">
              {activity.map((item) => (
                <li key={item.id}>
                  <div>
                    <a className="rowlink" href={item.link || "/overview"}>{item.title}</a>
                    <div className="tiny">{prettyWhen(item.createdAt)}</div>
                  </div>
                  {item.amountCents != null ? <Money cents={item.amountCents} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <h3>Your day will show up here</h3>
              <p>Add a customer, schedule a job, or send an invoice.</p>
              <a className="btn" href="/customers/new">Add a customer</a>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

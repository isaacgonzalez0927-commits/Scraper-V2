import { desc, eq } from "drizzle-orm";
import { ConnectAssistantCallout, ConnectCashCallout } from "@/components/ConnectStripe";
import { SetupResumeCard } from "@/components/SereSetupWizard";
import { setupResume } from "@/lib/sere-setup";
import { Badge, Banner, Card, RowLink, Rows, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { integrationStatus } from "@/lib/integrations";
import { label, prettyDate, prettyWhen } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { loadStripeCash } from "@/lib/stripe-cash";
import { loadSquareCash } from "@/lib/square-cash";
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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { org, shell, brief, voice } = await loadApp();
  const q = await searchParams;
  const month = monthBounds();
  const week = weekBounds();
  const today = isoDate(new Date());
  const [revenue, collected, { outstanding, overdue }, jobRows, activity, invoiceRows, customerRows, integrations, stripeCash, squareCash] =
    await Promise.all([
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
    db().select({ id: customers.id }).from(customers).where(eq(customers.organizationId, org.id)),
    integrationStatus(org.id),
    loadStripeCash(org.id, month.start, month.end),
    loadSquareCash(org.id, month.start, month.end),
  ]);

  const jobsToday = jobRows.filter(
    (r) => r.job.scheduledStart?.slice(0, 10) === today && r.job.status !== "cancelled",
  );
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = isoDate(nextDay);
  const jobsTomorrow = jobRows.filter(
    (r) => r.job.scheduledStart?.slice(0, 10) === tomorrow && r.job.status !== "cancelled",
  );
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

  const resume = setupResume({
    customers: customerRows.length,
    jobs: jobRows.length,
    invoices: invoiceRows.length,
    stripe: integrations.stripe.connected,
  });

  return (
    <Shell
      {...shell}
      path="/overview"
      title={brief.greeting}
      sub={<p className="page-sub">{brief.summary}</p>}
      actions={<a className="btn" href="/jobs/new">{voice.newJob}</a>}
    >
      <Banner error={q.error} ok={q.ok} />
      {!shell.isDemo && resume ? <SetupResumeCard {...resume} /> : null}
      {!shell.isDemo ? (
        <>
          <ConnectCashCallout
            next="/overview"
            stripe={integrations.stripe.connected}
            square={integrations.square.connected}
          />
          <ConnectAssistantCallout next="/overview" connected={integrations.openai.connected} />
        </>
      ) : null}
      {brief.alerts.length ? (
        <div className="brief-row">
          {brief.alerts.map((alert) => (
            <a key={alert.title} className={`brief-chip tone-${alert.tone}`} href={alert.href}>
              <strong>{alert.title}</strong>
              <span>{alert.body}</span>
            </a>
          ))}
        </div>
      ) : null}

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

      {stripeCash.connected ? (
        <Card
          className="mt-2"
          title="In Stripe"
          note={stripeCash.error || "Live from the shop's Stripe. This is cash, not invoices."}
        >
          {stripeCash.error ? (
            <p className="muted">{stripeCash.error}</p>
          ) : (
            <>
              <div className="grid grid-3">
                <div className="stat-good">
                  <p className="stat-label">Available now</p>
                  <p className="stat-value">{formatMoney(stripeCash.availableCents)}</p>
                  <p className="stat-note">Ready to pay out</p>
                </div>
                <div>
                  <p className="stat-label">Pending</p>
                  <p className="stat-value">{formatMoney(stripeCash.pendingCents)}</p>
                  <p className="stat-note">Not yet available</p>
                </div>
                <div>
                  <p className="stat-label">Charged this month</p>
                  <p className="stat-value">{formatMoney(stripeCash.monthInCents)}</p>
                  <p className="stat-note">Succeeded charges, minus refunds</p>
                </div>
              </div>
              {stripeCash.payouts.length ? (
                <ul className="list mt-2">
                  {stripeCash.payouts.map((row) => (
                    <li key={row.id || row.arrival}>
                      <span>
                        {row.status === "paid" ? "Paid out" : label(row.status) || row.status}
                        {row.arrival ? ` · ${prettyDate(row.arrival)}` : ""}
                      </span>
                      <span className="money">{formatMoney(row.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted mt-2">No payouts yet.</p>
              )}
            </>
          )}
        </Card>
      ) : null}

      {squareCash.connected ? (
        <Card
          className="mt-2"
          title="In Square"
          note={squareCash.error || "Live from the shop's Square. This is cash, not invoices."}
        >
          {squareCash.error && !squareCash.monthInCents && !squareCash.payouts.length ? (
            <p className="muted">{squareCash.error}</p>
          ) : (
            <>
              <div className="grid grid-2">
                <div className="stat-good">
                  <p className="stat-label">Taken this month</p>
                  <p className="stat-value">{formatMoney(squareCash.monthInCents)}</p>
                  <p className="stat-note">Completed payments, minus refunds</p>
                </div>
                <div>
                  <p className="stat-label">In transit</p>
                  <p className="stat-value">{formatMoney(squareCash.inTransitCents)}</p>
                  <p className="stat-note">Payouts on the way to the bank</p>
                </div>
              </div>
              {squareCash.error ? <p className="muted mt-2">{squareCash.error}</p> : null}
              {squareCash.payouts.length ? (
                <ul className="list mt-2">
                  {squareCash.payouts.map((row) => (
                    <li key={row.id || row.arrival}>
                      <span>
                        {row.status === "PAID" || row.status === "SENT"
                          ? row.status === "PAID"
                            ? "Paid out"
                            : "In transit"
                          : label(row.status) || row.status}
                        {row.arrival ? ` · ${prettyDate(row.arrival)}` : ""}
                      </span>
                      <span className="money">{formatMoney(row.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted mt-2">No payouts yet.</p>
              )}
            </>
          )}
        </Card>
      ) : null}

      <div className="grid grid-2 mt-2">
        <Card
          title={`${voice.jobs} on the board`}
          action={<a className="btn btn-secondary btn-sm" href="/jobs">View all</a>}
        >
          <ul className="list">
            <li><span className="muted">Today</span><strong>{jobsToday.length}</strong></li>
            <li><span className="muted">Tomorrow</span><strong>{jobsTomorrow.length}</strong></li>
            <li><span className="muted">This week</span><strong>{jobsWeek.length}</strong></li>
            <li><span className="muted">Waiting to finish</span><strong>{awaiting.length}</strong></li>
          </ul>
          <p className="section-label mt-2">{jobsToday.length ? "Next up" : jobsTomorrow.length ? "Tomorrow" : "Next up"}</p>
          {(jobsToday.length ? awaiting : jobsTomorrow.length ? jobsTomorrow.slice(0, 6) : awaiting).length ? (
            <Rows>
              {(jobsToday.length ? awaiting : jobsTomorrow.length ? jobsTomorrow.slice(0, 6) : awaiting).map(({ job, customer }) => (
                <RowLink
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  title={job.title}
                  meta={`${displayName(customer)} · ${prettyWhen(job.scheduledStart) || "Unscheduled"}`}
                  badge={<Badge status={job.status} />}
                />
              ))}
            </Rows>
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
            <Rows>
              {activity.map((item) => (
                <RowLink
                  key={item.id}
                  href={item.link || "/overview"}
                  title={item.title}
                  meta={prettyWhen(item.createdAt)}
                  amount={item.amountCents != null ? formatMoney(item.amountCents) : undefined}
                />
              ))}
            </Rows>
          ) : (
            <div className="empty">
              <h3>Your day will show up here</h3>
              <p>{voice.emptyOverview}</p>
              <a className="btn" href="/customers/new">{voice.newCustomer}</a>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

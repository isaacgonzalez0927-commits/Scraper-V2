import { and, eq } from "drizzle-orm";
import { Card, KeyValue, Stat, Tabs } from "@/components/ui";
import { ConnectCashCallout } from "@/components/ConnectStripe";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { formatMargin, formatMoney, marginBps } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { prettyDate } from "@/lib/labels";
import {
  collectedCents,
  expectedCash,
  invoicedRevenueCents,
  jobCostTotal,
  jobRevenueCents,
  outstandingTotals,
  periodBounds,
} from "@/lib/queries";
import { loadStripeCash } from "@/lib/stripe-cash";
import { loadSquareCash } from "@/lib/square-cash";
import { jobs } from "@/lib/schema";

const PERIODS = [
  { key: "this_week", name: "This week" },
  { key: "this_month", name: "This month" },
  { key: "last_month", name: "Last month" },
  { key: "custom", name: "Custom" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const period = PERIODS.some((p) => p.key === q.period) ? (q.period as string) : "this_month";
  const { start, end } = periodBounds(period, q.start, q.end);
  const [moneyIn, invoiced, { outstanding, overdue }, expected, jobRows, stripeCash, squareCash] = await Promise.all([
    collectedCents(org.id, start, end),
    invoicedRevenueCents(org.id, start, end),
    outstandingTotals(org.id),
    expectedCash(org.id),
    db().select().from(jobs).where(and(eq(jobs.organizationId, org.id), eq(jobs.status, "completed"))),
    loadStripeCash(org.id, start, end),
    loadSquareCash(org.id, start, end),
  ]);

  const completed = [];
  for (const job of jobRows) {
    const stamp = (job.completedAt || "").slice(0, 10);
    if (!stamp || stamp < start || stamp > end) continue;
    const revenue = jobRevenueCents(job);
    const cost = await jobCostTotal(org.id, job.id, job.estimatedCostCents);
    completed.push({ job, revenue, cost, profit: revenue - cost });
  }
  const grossProfit = completed.reduce((s, r) => s + r.profit, 0);
  const avgValue = completed.length
    ? Math.round(completed.reduce((s, r) => s + r.revenue, 0) / completed.length)
    : 0;
  const avgMargin = completed.length
    ? Math.round(completed.reduce((s, r) => s + (marginBps(r.revenue, r.cost) || 0), 0) / completed.length)
    : null;
  const ranked = [...completed].sort((a, b) => b.profit - a.profit);
  /* With only a handful of jobs, a best and a worst list are the same list twice. */
  const split = ranked.length > 8;
  const best = ranked.slice(0, 5);
  const worst = [...ranked].reverse().slice(0, 5);

  return (
    <Shell
      {...shell}
      path="/reports"
      title="Cash and profit"
      sub={
        <p className="page-sub">
          {prettyDate(start)} to {prettyDate(end)}. Collected in Sere is what you logged.
          Stripe and Square are what actually hit those accounts.
        </p>
      }
    >
      <div className="toolbar">
        <Tabs
          tabs={PERIODS.map((p) => ({ key: p.key, name: p.name, href: `/reports?period=${p.key}` }))}
          active={period}
        />
        {period === "custom" ? (
          <form className="date-range" method="get">
            <input type="hidden" name="period" value="custom" />
            <input className="input" type="date" name="start" defaultValue={start} />
            <input className="input" type="date" name="end" defaultValue={end} />
            <button className="btn btn-secondary" type="submit">Apply</button>
          </form>
        ) : null}
      </div>

      {!shell.isDemo ? (
        <ConnectCashCallout stripe={stripeCash.connected} square={squareCash.connected} />
      ) : null}

      <div className="grid grid-4">
        <Stat label="Money in" value={formatMoney(moneyIn)} note="Payments logged in Sere" tone="good" />
        <Stat label="Invoiced" value={formatMoney(invoiced)} note="Billed in this period, not cash" />
        <Stat label="Outstanding" value={formatMoney(outstanding)} note="Still owed across all open invoices" />
        <Stat
          label="Overdue"
          value={formatMoney(overdue)}
          note="Past the due date"
          tone={overdue > 0 ? "bad" : undefined}
        />
      </div>

      {stripeCash.connected ? (
        <div className="grid grid-3 mt-2">
          <Stat
            label="In Stripe now"
            value={formatMoney(stripeCash.availableCents)}
            note={stripeCash.error || "Available to pay out"}
            tone="good"
          />
          <Stat label="Pending in Stripe" value={formatMoney(stripeCash.pendingCents)} note="Not yet available" />
          <Stat
            label="Stripe charges"
            value={formatMoney(stripeCash.monthInCents)}
            note="Succeeded charges in this period, minus refunds"
          />
        </div>
      ) : null}

      {squareCash.connected ? (
        <div className="grid grid-2 mt-2">
          <Stat
            label="Taken in Square"
            value={formatMoney(squareCash.monthInCents)}
            note={squareCash.error || "Completed payments this period, minus refunds"}
            tone="good"
          />
          <Stat
            label="Square in transit"
            value={formatMoney(squareCash.inTransitCents)}
            note="Payouts on the way to the bank"
          />
        </div>
      ) : null}

      <div className="grid grid-2 mt-2">
        <Card title="Expected cash by due date">
          {expected.length ? (
            <ul className="list">
              {expected.map((row) => (
                <li key={row.date}>
                  <span>{prettyDate(row.date)}</span>
                  <span className="money">{formatMoney(row.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing is waiting on a due date.</p>
          )}
        </Card>

        <Card title="Job profitability" note={`${completed.length} completed jobs in this period`}>
          <KeyValue
            rows={[
              ["Average job value", formatMoney(avgValue)],
              ["Average margin", formatMargin(avgMargin)],
              ["Gross profit", formatMoney(grossProfit)],
            ]}
          />
        </Card>
      </div>

      <div className={`grid ${split ? "grid-2" : ""} mt-2`}>
        <Card title={split ? "Most profitable jobs" : "Profit by job"} note={split ? undefined : "Highest profit first"}>
          {best.length ? (
            <ul className="list">
              {(split ? best : ranked).map((row) => (
                <li key={row.job.id}>
                  <a className="rowlink" href={`/jobs/${row.job.id}`}>{row.job.title}</a>
                  <span className="money">{formatMoney(row.profit)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Complete a job and log its costs to see this.</p>
          )}
        </Card>

        {split ? (
          <Card title="Least profitable jobs">
            <ul className="list">
              {worst.map((row) => (
                <li key={row.job.id}>
                  <a className="rowlink" href={`/jobs/${row.job.id}`}>{row.job.title}</a>
                  <span className="money">{formatMoney(row.profit)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </Shell>
  );
}

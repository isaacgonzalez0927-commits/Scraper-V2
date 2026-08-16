import { and, eq } from "drizzle-orm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { formatMargin, formatMoney, marginBps } from "@/lib/money";
import { loadApp } from "@/lib/page";
import {
  collectedCents,
  expectedCash,
  invoicedRevenueCents,
  jobCostTotal,
  jobRevenueCents,
  outstandingTotals,
  periodBounds,
} from "@/lib/queries";
import { jobs } from "@/lib/schema";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const period = q.period || "this_month";
  const { start, end } = periodBounds(period, q.start, q.end);
  const [moneyIn, invoiced, { outstanding, overdue }, expected, jobRows] = await Promise.all([
    collectedCents(org.id, start, end),
    invoicedRevenueCents(org.id, start, end),
    outstandingTotals(org.id),
    expectedCash(org.id),
    db().select().from(jobs).where(and(eq(jobs.organizationId, org.id), eq(jobs.status, "completed"))),
  ]);

  const completed = [];
  for (const job of jobRows) {
    const stamp = (job.completedAt || "").slice(0, 10);
    if (!stamp || stamp < start || stamp > end) continue;
    const revenue = jobRevenueCents(job);
    const cost = await jobCostTotal(org.id, job.id, job.estimatedCostCents);
    completed.push({ job, revenue, cost, profit: revenue - cost });
  }
  const monthlyProfit = completed.reduce((s, r) => s + r.profit, 0);
  const avgValue = completed.length ? Math.round(completed.reduce((s, r) => s + r.revenue, 0) / completed.length) : 0;
  const avgMargin = completed.length
    ? Math.round(completed.reduce((s, r) => s + (marginBps(r.revenue, r.cost) || 0), 0) / completed.length)
    : null;
  const ranked = [...completed].sort((a, b) => b.profit - a.profit);
  const best = ranked.slice(0, 5);
  const worst = [...ranked].reverse().slice(0, 5);

  return (
    <Shell
      {...shell}
      path="/reports"
      title="Cash & profit"
      sub={<p className="page-sub">Collected cash is not the same as invoiced revenue.</p>}
    >
      <form className="filters" method="get">
        {[
          ["this_week", "This week"],
          ["this_month", "This month"],
          ["last_month", "Last month"],
          ["custom", "Custom"],
        ].map(([key, name]) => (
          <a key={key} className={`chip ${period === key ? "active" : ""}`} href={`/reports?period=${key}`}>
            {name}
          </a>
        ))}
      </form>
      {period === "custom" ? (
        <form className="filters" method="get">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="start" defaultValue={start} />
          <input type="date" name="end" defaultValue={end} />
          <button className="btn btn-secondary btn-sm" type="submit">Apply</button>
        </form>
      ) : null}

      <div className="grid grid-4">
        <article className="card stat-good">
          <p className="stat-label">Money in</p>
          <p className="stat-value money">{formatMoney(moneyIn)}</p>
          <p className="stat-note">Payments received in this period</p>
        </article>
        <article className="card">
          <p className="stat-label">Invoiced</p>
          <p className="stat-value money">{formatMoney(invoiced)}</p>
          <p className="stat-note">Issued invoices — not cash</p>
        </article>
        <article className="card">
          <p className="stat-label">Outstanding</p>
          <p className="stat-value money">{formatMoney(outstanding)}</p>
          <p className="stat-note">Still owed, all open invoices</p>
        </article>
        <article className="card stat-bad">
          <p className="stat-label">Overdue</p>
          <p className="stat-value money">{formatMoney(overdue)}</p>
        </article>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Expected cash by due date</div>
          {expected.length ? expected.map((row) => (
            <div key={row.date} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0eeea" }}>
              <span>{row.date}</span>
              <span className="money">{formatMoney(row.amountCents)}</span>
            </div>
          )) : <p className="muted">Nothing waiting on a due date.</p>}
        </section>
        <section className="card">
          <div className="card-title">Job profitability</div>
          <p>Average job value <strong className="money">{formatMoney(avgValue)}</strong></p>
          <p>Average margin <strong>{formatMargin(avgMargin)}</strong></p>
          <p>Gross profit in period <strong className="money">{formatMoney(monthlyProfit)}</strong></p>
        </section>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Most profitable</div>
          {best.length ? best.map((row) => (
            <p key={row.job.id}>
              <a href={`/jobs/${row.job.id}`}>{row.job.title}</a>{" "}
              <span className="money">{formatMoney(row.profit)}</span>
            </p>
          )) : <p className="muted">Complete a job and add costs to see this.</p>}
        </section>
        <section className="card">
          <div className="card-title">Least profitable</div>
          {worst.length ? worst.map((row) => (
            <p key={row.job.id}>
              <a href={`/jobs/${row.job.id}`}>{row.job.title}</a>{" "}
              <span className="money">{formatMoney(row.profit)}</span>
            </p>
          )) : <p className="muted">No completed jobs in this period.</p>}
        </section>
      </div>
    </Shell>
  );
}

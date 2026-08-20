import { sendInvoiceReminderAction } from "@/app/actions";
import { Card } from "@/components/ui";
import type { OwnerIntelligence } from "@/lib/owner-intelligence";
import { formatMoney } from "@/lib/money";

function trendText(intelligence: OwnerIntelligence): string {
  if (intelligence.trendPercent === null) {
    return (
      `${formatMoney(intelligence.currentWeekCents)} came in this week; ` +
      "there was no cash in the same days last week."
    );
  }
  if (intelligence.trendPercent === 0) {
    return (
      "Cash is flat against the same days last week at " +
      `${formatMoney(intelligence.currentWeekCents)}.`
    );
  }
  const direction = intelligence.trendPercent > 0 ? "up" : "down";
  return (
    `Cash is ${direction} ${Math.abs(intelligence.trendPercent)}% against ` +
    `the same days last week: ${formatMoney(intelligence.currentWeekCents)} ` +
    `versus ${formatMoney(intelligence.priorWeekCents)}.`
  );
}

export function OwnerBrief({
  intelligence,
  processorCashCents,
  emailConnected,
}: {
  intelligence: OwnerIntelligence;
  processorCashCents: number;
  emailConnected: boolean;
}) {
  const processorGap = Math.max(
    0,
    processorCashCents - intelligence.processorTrackedCents,
  );
  const toRemind = intelligence.followUps.filter((row) => !row.remindedToday);

  return (
    <Card
      className="owner-brief mt-2"
      title="Nova’s owner brief"
      note="Stripe/Square move money. QuickBooks keeps books. Sere explains the work."
    >
      <div className="owner-readout">
        <p>
          <strong>{formatMoney(intelligence.collectedThisMonthCents)}</strong> came
          into the Sere ledger this month.{" "}
          <strong>{formatMoney(intelligence.mappedToJobsCents)}</strong> traces to{" "}
          <strong>
            {intelligence.mappedJobCount}{" "}
            {intelligence.mappedJobCount === 1 ? "job" : "jobs"}
          </strong>
          ; those jobs show{" "}
          <strong>{formatMoney(intelligence.mappedJobProfitCents)}</strong> gross
          profit after recorded costs.
        </p>
        <p>{trendText(intelligence)}</p>
        {intelligence.overdueCents > 0 ? (
          <p className="owner-risk">
            <strong>{formatMoney(intelligence.overdueCents)}</strong> is overdue
            across {intelligence.overdueCount}{" "}
            {intelligence.overdueCount === 1 ? "invoice" : "invoices"}. Nova put{" "}
            {toRemind.length} {toRemind.length === 1 ? "customer" : "customers"}{" "}
            on today’s follow-up list.
          </p>
        ) : (
          <p className="owner-good">No overdue invoice balance needs follow-up.</p>
        )}
        {intelligence.unmappedCents > 0 ? (
          <p>
            <strong>{formatMoney(intelligence.unmappedCents)}</strong> in the Sere
            ledger is not tied through an invoice to a job yet.{" "}
            <a href="/payments">Clean up payments</a>.
          </p>
        ) : null}
        {processorGap > 0 ? (
          <p>
            Stripe/Square show about <strong>{formatMoney(processorGap)}</strong>{" "}
            more cash than Sere can trace to processor payments. Nova leaves it
            unmatched instead of inventing a job.
          </p>
        ) : null}
      </div>

      <div className="owner-brief-grid mt-2">
        <section>
          <h3>Where the money came from</h3>
          {intelligence.trails.length ? (
            <ul className="money-trails">
              {intelligence.trails.slice(0, 5).map((trail) => (
                <li key={trail.paymentId}>
                  <div>
                    <strong>{formatMoney(trail.amountCents)}</strong>
                    <span>
                      {trail.jobId ? (
                        <a href={`/jobs/${trail.jobId}`}>{trail.jobTitle}</a>
                      ) : (
                        "Not tied to a job"
                      )}
                    </span>
                    <small>
                      {trail.customerName}
                      {trail.invoiceNumber ? ` · ${trail.invoiceNumber}` : ""}
                      {` · ${trail.source}`}
                    </small>
                  </div>
                  {trail.jobId ? (
                    <div className="trail-profit">
                      <span>{formatMoney(trail.jobProfitCents)}</span>
                      <small>
                        whole job profit · {formatMoney(trail.jobCostCents)} cost
                      </small>
                    </div>
                  ) : (
                    <a className="btn btn-secondary btn-sm" href="/payments">
                      Match
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No payment has landed this month. When one does, its trail shows here.
            </p>
          )}
        </section>

        <section>
          <h3>Follow up today</h3>
          {intelligence.followUps.length ? (
            <ul className="follow-up-list">
              {intelligence.followUps.slice(0, 3).map((row) => (
                <li key={row.invoiceId}>
                  <div>
                    <a href={`/invoices/${row.invoiceId}`}>
                      <strong>{row.customerName}</strong>
                    </a>
                    <span>
                      {row.invoiceNumber} · {formatMoney(row.balanceCents)} ·{" "}
                      {row.daysOverdue}d late
                    </span>
                  </div>
                  <div className="row">
                    {row.phone ? (
                      <a className="btn btn-secondary btn-sm" href={`tel:${row.phone}`}>
                        Call
                      </a>
                    ) : null}
                    {row.remindedToday ? (
                      <span className="badge badge-paid">Reminded today</span>
                    ) : emailConnected && row.email ? (
                      <form action={sendInvoiceReminderAction}>
                        <input type="hidden" name="invoice_id" value={row.invoiceId} />
                        <button className="btn btn-secondary btn-sm" type="submit">
                          Email reminder
                        </button>
                      </form>
                    ) : (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`/invoices/${row.invoiceId}`}
                      >
                        Open
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing overdue needs a call or reminder today.</p>
          )}
          {!emailConnected && toRemind.some((row) => row.email) ? (
            <p className="help mt-1">
              <a href="/settings?tab=integrations#email">Connect email</a> for
              one-tap reminders. Nova never sends one without you tapping.
            </p>
          ) : null}
        </section>
      </div>
    </Card>
  );
}

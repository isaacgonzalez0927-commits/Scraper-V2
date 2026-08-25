import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  convertEstimateToJobAction,
  sendEstimateAction,
  voidEstimateAction,
} from "@/app/actions";
import { Shell } from "@/components/Shell";
import { Badge, Banner, Card, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { canEditEstimate } from "@/lib/estimates";
import { integrationStatus } from "@/lib/integrations";
import { prettyDate, prettyWhen } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { absoluteBaseUrl } from "@/lib/url";
import { customers, estimateEvents, estimateLines, estimates, jobs } from "@/lib/schema";

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const q = await searchParams;
  const [estimate] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, Number(id)), eq(estimates.organizationId, org.id)));
  if (!estimate) notFound();
  const [customer, lines, events, convertedJob, integrations, base] = await Promise.all([
    db()
      .select()
      .from(customers)
      .where(and(eq(customers.id, estimate.customerId), eq(customers.organizationId, org.id)))
      .then((rows) => rows[0]),
    db()
      .select()
      .from(estimateLines)
      .where(and(eq(estimateLines.estimateId, estimate.id), eq(estimateLines.organizationId, org.id))),
    db()
      .select()
      .from(estimateEvents)
      .where(and(eq(estimateEvents.estimateId, estimate.id), eq(estimateEvents.organizationId, org.id)))
      .orderBy(desc(estimateEvents.createdAt)),
    estimate.convertedJobId
      ? db()
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, estimate.convertedJobId), eq(jobs.organizationId, org.id)))
          .then((rows) => rows[0])
      : Promise.resolve(undefined),
    integrationStatus(org.id),
    absoluteBaseUrl(),
  ]);
  if (!customer) notFound();
  const editable = canEditEstimate(estimate.status);
  const publicPath = `/p/est/${estimate.publicToken}`;
  const publicUrl = `${base}${publicPath}`;

  return (
    <Shell
      {...shell}
      path="/estimates"
      title={estimate.number}
      sub={<p className="page-sub"><a href={`/customers/${customer.id}`}>{displayName(customer)}</a>{" · "}{prettyDate(estimate.issueDate)}</p>}
      actions={
        <>
          <Badge status={estimate.status} />
          <a className="btn btn-secondary" href={`/estimates/${estimate.id}/preview`}>Preview</a>
          {editable ? <a className="btn btn-secondary" href={`/estimates/${estimate.id}/edit`}>Edit</a> : null}
          {editable ? (
            <form action={sendEstimateAction}>
              <input type="hidden" name="id" value={estimate.id} />
              <button className="btn" type="submit">{integrations.email.connected ? "Email estimate" : "Mark sent"}</button>
            </form>
          ) : null}
          {estimate.status === "approved" ? (
            <form action={convertEstimateToJobAction}>
              <input type="hidden" name="id" value={estimate.id} />
              <button className="btn" type="submit">Create job</button>
            </form>
          ) : null}
          {convertedJob ? <a className="btn" href={`/jobs/${convertedJob.id}`}>Open job</a> : null}
        </>
      }
    >
      <Banner error={q.error} info={q.notice} />
      <div className="grid grid-3">
        <Stat label="Estimate total" value={formatMoney(estimate.totalCents)} />
        <Stat label="Issued" value={prettyDate(estimate.issueDate)} small />
        <Stat label="Valid until" value={prettyDate(estimate.validUntil)} small />
      </div>

      <div className="grid grid-2 mt-2">
        <Card title="Line items">
          <div className="table-wrap">
            <table className="data table-inline">
              <thead><tr><th>Description</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Amount</th></tr></thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td className="right">{line.quantity}</td>
                    <td className="right money">{formatMoney(line.unitPriceCents)}</td>
                    <td className="right money">{formatMoney(line.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sheet-totals">
            <div className="sheet-total-row"><span>Subtotal</span><span>{formatMoney(estimate.subtotalCents)}</span></div>
            {estimate.discountCents ? <div className="sheet-total-row"><span>Discount</span><span>{formatMoney(-estimate.discountCents)}</span></div> : null}
            <div className="sheet-total-row"><span>Tax</span><span>{formatMoney(estimate.taxCents)}</span></div>
            <div className="sheet-total-row due"><span>Total</span><span>{formatMoney(estimate.totalCents)}</span></div>
          </div>
          {estimate.notes ? <p className="muted mt-2">{estimate.notes}</p> : null}
          {estimate.status !== "converted" && estimate.status !== "void" ? (
            <form action={voidEstimateAction} className="mt-2">
              <input type="hidden" name="id" value={estimate.id} />
              <button className="btn btn-ghost btn-sm" type="submit">Void this estimate</button>
            </form>
          ) : null}
        </Card>

        <div className="col">
          <Card title="Customer link" note="Anyone with this link can view and respond to the estimate.">
            <div className="copy-row">
              <a className="copy-value" href={publicPath} target="_blank" rel="noreferrer">{publicUrl || publicPath}</a>
              <button className="btn btn-secondary btn-sm" type="button" data-copy={publicUrl || publicPath}>Copy</button>
            </div>
            <p className="tiny mt-2">No deposit or payment is collected from an estimate.</p>
          </Card>
          <Card title="Activity">
            <ul className="timeline">
              {events.length ? events.map((event) => (
                <li key={event.id}><strong>{event.message}</strong><div className="tiny">{prettyWhen(event.createdAt)}</div></li>
              )) : (
                <li>Estimate created<div className="tiny">{prettyWhen(estimate.createdAt)}</div></li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

"use client";

import { approveEstimateAction, declineEstimateAction } from "@/app/estimate-actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge, Banner } from "@/components/ui";
import { displayName, formatAddress } from "@/lib/display";
import { prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { customers, estimateLines, estimates, organizations } from "@/lib/schema";

export function EstimateSheet({
  org,
  estimate,
  customer,
  lines,
  publicView,
  publicToken,
  ok,
  error,
}: {
  org: typeof organizations.$inferSelect;
  estimate: typeof estimates.$inferSelect;
  customer: typeof customers.$inferSelect;
  lines: (typeof estimateLines.$inferSelect)[];
  publicView?: boolean;
  publicToken?: string;
  ok?: string;
  error?: string;
}) {
  const address =
    formatAddress(customer.billingLine1, customer.billingCity, customer.billingState, customer.billingPostal) ||
    formatAddress(customer.serviceLine1, customer.serviceCity, customer.serviceState, customer.servicePostal);
  const canRespond = publicView && (estimate.status === "sent" || estimate.status === "viewed");

  return (
    <div className="sheet-page">
      <div className="sheet">
        {publicView ? (
          <div className="no-print">
            {ok === "approved" ? <Banner ok="Estimate approved. The shop has been notified." /> : null}
            {ok === "declined" ? <Banner info="Estimate declined. The shop has been notified." /> : null}
            <Banner error={error} />
          </div>
        ) : null}

        <div className="sheet-head">
          <div>
            <div className="brand">
              <BrandLogo className="brand-mark" crop="icon" />
              <span className="brand-name">{org.name}</span>
            </div>
            <p className="tiny">
              {formatAddress(org.addressLine1, org.city, org.state, org.postalCode)}
              {org.email ? <><br />{org.email}</> : null}
              {org.phone ? <><br />{org.phone}</> : null}
            </p>
          </div>
          <div className="right">
            <p className="section-label">Estimate</p>
            <p className="sheet-number">{estimate.number}</p>
            <Badge status={estimate.status} />
          </div>
        </div>

        <div className="grid grid-2 mt-3">
          <div>
            <p className="section-label">Prepared for</p>
            <p className="strong">{displayName(customer)}</p>
            <p className="tiny">
              {address}
              {customer.email ? <><br />{customer.email}</> : null}
              {customer.phone ? <><br />{customer.phone}</> : null}
            </p>
          </div>
          <div>
            <p className="section-label">Dates</p>
            <div className="kv">
              <div className="kv-row"><span className="kv-key">Issued</span><span className="kv-value">{prettyDate(estimate.issueDate)}</span></div>
              <div className="kv-row"><span className="kv-key">Valid until</span><span className="kv-value">{prettyDate(estimate.validUntil)}</span></div>
            </div>
          </div>
        </div>

        <div className="table-wrap mt-3">
          <table className="data table-inline">
            <thead>
              <tr>
                <th>Description</th>
                <th className="right">Qty</th>
                <th className="right">Price</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
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
          {estimate.discountCents ? (
            <div className="sheet-total-row"><span>Discount</span><span>{formatMoney(-estimate.discountCents)}</span></div>
          ) : null}
          <div className="sheet-total-row"><span>Tax</span><span>{formatMoney(estimate.taxCents)}</span></div>
          <div className="sheet-total-row due"><span>Estimate total</span><span>{formatMoney(estimate.totalCents)}</span></div>
        </div>

        {estimate.notes ? (
          <>
            <p className="section-label mt-3">Notes</p>
            <p className="muted">{estimate.notes}</p>
          </>
        ) : null}

        {publicView ? (
          <div className="no-print">
            <div className="sheet-pay">
              {canRespond ? (
                <>
                  <p className="strong">Ready to respond?</p>
                  <p className="tiny">Approving lets {org.name} turn this estimate into a job. No payment is collected.</p>
                  <div className="pay-methods mt-2">
                    <form action={approveEstimateAction}>
                      <input type="hidden" name="token" value={publicToken} />
                      <button className="btn" type="submit">Approve estimate</button>
                    </form>
                    <form action={declineEstimateAction}>
                      <input type="hidden" name="token" value={publicToken} />
                      <button className="btn btn-secondary" type="submit">Decline</button>
                    </form>
                  </div>
                </>
              ) : (
                <p className="strong">
                  {estimate.status === "approved"
                    ? "You approved this estimate."
                    : estimate.status === "declined"
                      ? "You declined this estimate."
                      : estimate.status === "converted"
                        ? "This approved estimate has been converted to a job."
                        : estimate.status === "void"
                          ? "This estimate is no longer active."
                          : "This estimate is not ready for a response."}
                </p>
              )}
            </div>
            <button className="btn btn-secondary mt-2" type="button" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </div>
        ) : (
          <div className="row mt-3 no-print">
            <a className="btn btn-secondary" href={`/estimates/${estimate.id}`}>Back to estimate</a>
            <button className="btn" type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </div>
        )}
      </div>
    </div>
  );
}

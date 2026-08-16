"use client";

import { startInvoiceCheckoutAction } from "@/app/pay-actions";
import { Badge, Banner } from "@/components/ui";
import { BrandLogo } from "@/components/BrandLogo";
import { displayName, formatAddress } from "@/lib/display";
import { prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { customers, invoiceLines, invoices, organizations } from "@/lib/schema";

export function InvoiceSheet({
  org,
  invoice,
  customer,
  lines,
  paid,
  balance,
  publicView,
  publicToken,
  canPayOnline,
  paidJustNow,
  cancelled,
  error,
}: {
  org: typeof organizations.$inferSelect;
  invoice: typeof invoices.$inferSelect;
  customer: typeof customers.$inferSelect;
  lines: (typeof invoiceLines.$inferSelect)[];
  paid: number;
  balance: number;
  publicView?: boolean;
  publicToken?: string;
  canPayOnline?: boolean;
  paidJustNow?: boolean;
  cancelled?: boolean;
  error?: string;
}) {
  const billTo =
    formatAddress(customer.billingLine1, customer.billingCity, customer.billingState, customer.billingPostal) ||
    formatAddress(customer.serviceLine1, customer.serviceCity, customer.serviceState, customer.servicePostal);

  return (
    <div className="sheet-page">
      <div className="sheet">
        {publicView ? (
          <div className="no-print">
            {paidJustNow ? <Banner ok={`Payment received. Thank you. ${org.name} has been notified.`} /> : null}
            {cancelled ? <Banner warn="Checkout was cancelled. Nothing was charged." /> : null}
            {error ? <Banner error={error} /> : null}
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
            <p className="section-label">Invoice</p>
            <p className="sheet-number">{invoice.number}</p>
            <Badge status={invoice.status} />
          </div>
        </div>

        <div className="grid grid-2 mt-3">
          <div>
            <p className="section-label">Billed to</p>
            <p className="strong">{displayName(customer)}</p>
            <p className="tiny">
              {billTo}
              {customer.email ? <><br />{customer.email}</> : null}
              {customer.phone ? <><br />{customer.phone}</> : null}
            </p>
          </div>
          <div>
            <p className="section-label">Dates</p>
            <div className="kv">
              <div className="kv-row"><span className="kv-key">Issued</span><span className="kv-value">{prettyDate(invoice.issueDate)}</span></div>
              <div className="kv-row"><span className="kv-key">Due</span><span className="kv-value">{prettyDate(invoice.dueDate)}</span></div>
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
          <div className="sheet-total-row"><span>Subtotal</span><span>{formatMoney(invoice.subtotalCents)}</span></div>
          {invoice.discountCents ? (
            <div className="sheet-total-row"><span>Discount</span><span>{formatMoney(-invoice.discountCents)}</span></div>
          ) : null}
          <div className="sheet-total-row"><span>Tax</span><span>{formatMoney(invoice.taxCents)}</span></div>
          <div className="sheet-total-row"><span>Total</span><span>{formatMoney(invoice.totalCents)}</span></div>
          <div className="sheet-total-row"><span>Paid</span><span>{formatMoney(paid)}</span></div>
          <div className="sheet-total-row due"><span>Balance due</span><span>{formatMoney(balance)}</span></div>
        </div>

        {invoice.notes ? (
          <>
            <p className="section-label mt-3">Notes</p>
            <p className="muted">{invoice.notes}</p>
          </>
        ) : null}

        {publicView ? (
          <div className="no-print">
            {balance > 0 ? (
              <div className="sheet-pay">
                {canPayOnline ? (
                  <>
                    <p className="strong">Pay {formatMoney(balance)} online</p>
                    <p className="tiny">
                      Card payments are handled by Stripe. {org.name} never sees your card number.
                    </p>
                    <form action={startInvoiceCheckoutAction} className="mt-2">
                      <input type="hidden" name="token" value={publicToken} />
                      <button className="btn" type="submit">Pay this invoice</button>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="strong">How to pay</p>
                    <p className="tiny">
                      Contact {org.name} to pay by card, bank transfer, check, or cash.
                      {org.phone ? ` Call ${org.phone}.` : ""}
                      {org.email ? ` Email ${org.email}.` : ""}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="sheet-pay">
                <p className="strong">This invoice is paid in full.</p>
                <p className="tiny">Nothing further is owed. Keep this page for your records.</p>
              </div>
            )}
            <div className="row mt-2">
              <button className="btn btn-secondary" type="button" onClick={() => window.print()}>
                Print or save as PDF
              </button>
            </div>
          </div>
        ) : (
          <div className="row mt-3 no-print">
            <a className="btn btn-secondary" href={`/invoices/${invoice.id}`}>Back to invoice</a>
            <button className="btn" type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </div>
        )}
      </div>
    </div>
  );
}

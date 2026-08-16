"use client";

import { Badge } from "@/components/ui";
import { BrandMark } from "@/components/BrandMark";
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
}: {
  org: typeof organizations.$inferSelect;
  invoice: typeof invoices.$inferSelect;
  customer: typeof customers.$inferSelect;
  lines: (typeof invoiceLines.$inferSelect)[];
  paid: number;
  balance: number;
  publicView?: boolean;
}) {
  return (
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="brand" style={{ paddingBottom: 8 }}>
            <BrandMark className="brand-mark-image" size={34} />
            <span className="brand-name">{org.name}</span>
          </div>
          <p className="tiny">
            {org.addressLine1} {org.city} {org.state} {org.postalCode}
            <br />
            {org.email} {org.phone}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="tiny">Invoice</div>
          <h1 className="page-title" style={{ fontSize: 28 }}>{invoice.number}</h1>
          <Badge status={invoice.status} />
        </div>
      </div>
      <div className="grid grid-2" style={{ margin: "24px 0" }}>
        <div>
          <div className="tiny">Bill to</div>
          <strong>{displayName(customer)}</strong>
          <p className="tiny">
            {formatAddress(customer.billingLine1, customer.billingCity, customer.billingState, customer.billingPostal)
              || formatAddress(customer.serviceLine1, customer.serviceCity, customer.serviceState, customer.servicePostal)}
            <br />
            {customer.email} {customer.phone}
          </p>
        </div>
        <div>
          <p>Issued {prettyDate(invoice.issueDate)}<br />Due {prettyDate(invoice.dueDate)}</p>
        </div>
      </div>
      <table className="data">
        <thead>
          <tr><th>Description</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Amount</th></tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.description}</td>
              <td className="right">{line.quantity}</td>
              <td className="right">{formatMoney(line.unitPriceCents)}</td>
              <td className="right">{formatMoney(line.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ textAlign: "right", marginTop: 16 }}>
        Subtotal {formatMoney(invoice.subtotalCents)}<br />
        {invoice.discountCents ? <>Discount {formatMoney(invoice.discountCents)}<br /></> : null}
        Tax {formatMoney(invoice.taxCents)}<br />
        <strong>Total {formatMoney(invoice.totalCents)}</strong><br />
        Paid {formatMoney(paid)}<br />
        <strong>Balance due {formatMoney(balance)}</strong>
      </p>
      {invoice.notes ? <p className="tiny">{invoice.notes}</p> : null}
      <div className="no-print" style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {publicView ? (
          balance > 0 ? (
            <span className="notice">
              Pay {org.name} by card, ACH, check, or cash. Online card checkout needs STRIPE_SECRET_KEY.
            </span>
          ) : null
        ) : (
          <>
            <a className="btn btn-secondary" href={`/invoices/${invoice.id}`}>Back</a>
            <button className="btn" type="button" onClick={() => window.print()}>Print / save PDF</button>
          </>
        )}
      </div>
    </div>
  );
}

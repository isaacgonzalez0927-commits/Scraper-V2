import { and, eq, like, or } from "drizzle-orm";
import { Empty } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { label, prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { customers, invoices, payments } from "@/lib/schema";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { org, shell } = await loadApp();
  const { q } = await searchParams;
  const term = (q || "").trim();
  const rows = await db()
    .select({ payment: payments, customer: customers, invoice: invoices })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(eq(payments.organizationId, org.id));
  const filtered = term
    ? rows.filter(({ payment, customer, invoice }) => {
        const hay = [customer.name, customer.companyName, payment.reference, invoice?.number || ""].join(" ").toLowerCase();
        return hay.includes(term.toLowerCase());
      })
    : rows;

  return (
    <Shell
      {...shell}
      path="/payments"
      title="Payments"
      sub={<p className="page-sub">Cash that actually arrived. Voided payments drop out of reports.</p>}
      actions={<a className="btn" href="/payments/new">Record payment</a>}
    >
      <form className="filters" method="get">
        <input
          name="q"
          defaultValue={term}
          placeholder="Customer, invoice, reference"
          style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "7px 12px", minWidth: 220 }}
        />
        <button className="btn btn-secondary btn-sm" type="submit">Search</button>
      </form>
      {filtered.length ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ payment, customer, invoice }) => (
                <tr key={payment.id} style={payment.voidedAt ? { opacity: 0.5 } : undefined}>
                  <td><a className="rowlink" href={`/payments/${payment.id}`}>{prettyDate(payment.paidOn)}</a></td>
                  <td>{displayName(customer)}</td>
                  <td>
                    {invoice ? <a href={`/invoices/${invoice.id}`}>{invoice.number}</a> : "Unapplied"}
                    {payment.voidedAt ? <span className="tiny"> · voided</span> : null}
                  </td>
                  <td>{label(payment.method)}</td>
                  <td>{payment.reference || "—"}</td>
                  <td className="right money">{formatMoney(payment.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No payments recorded"
          body="When a customer pays — card, check, cash, or ACH — log it here."
          href="/payments/new"
          action="Record payment"
        />
      )}
    </Shell>
  );
}

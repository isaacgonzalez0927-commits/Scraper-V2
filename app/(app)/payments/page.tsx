import { eq } from "drizzle-orm";
import { Blank, Empty, SearchField, Stat } from "@/components/ui";
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
        const hay = [customer.name, customer.companyName, payment.reference, invoice?.number || ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(term.toLowerCase());
      })
    : rows;
  const live = filtered.filter((r) => !r.payment.voidedAt);
  const total = live.reduce((sum, r) => sum + r.payment.amountCents, 0);

  return (
    <Shell
      {...shell}
      path="/payments"
      title="Payments"
      sub={<p className="page-sub">Cash that actually arrived. Voided payments drop out of every report.</p>}
      actions={<a className="btn" href="/payments/new">Record payment</a>}
    >
      <div className="grid grid-3">
        <Stat label="Payments shown" value={String(live.length)} small />
        <Stat label="Total collected" value={formatMoney(total)} tone="good" />
        <Stat label="Voided" value={String(filtered.length - live.length)} small note="Excluded from totals" />
      </div>

      <div className="toolbar mt-2">
        <SearchField value={term} placeholder="Customer, invoice, or reference" />
      </div>

      {filtered.length ? (
        <div className="card card-flush table-wrap">
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
                <tr key={payment.id} className={payment.voidedAt ? "void-row" : undefined}>
                  <td><a className="rowlink" href={`/payments/${payment.id}`}>{prettyDate(payment.paidOn)}</a></td>
                  <td>{displayName(customer)}</td>
                  <td>
                    {invoice ? <a href={`/invoices/${invoice.id}`}>{invoice.number}</a> : <Blank text="Unapplied" />}
                    {payment.voidedAt ? <span className="tiny"> · voided</span> : null}
                  </td>
                  <td>{label(payment.method)}</td>
                  <td>{payment.reference || <Blank text="None" />}</td>
                  <td className="right money">{formatMoney(payment.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No payments recorded"
          body="When a customer pays by card, check, cash, or bank transfer, log it here."
          href="/payments/new"
          action="Record payment"
        />
      )}
    </Shell>
  );
}

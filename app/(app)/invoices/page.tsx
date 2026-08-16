import { and, eq } from "drizzle-orm";
import { Badge, Empty, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { balanceCents } from "@/lib/finance";
import { INVOICE_STATUSES, label, prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { paidMap } from "@/lib/queries";
import { customers, invoices } from "@/lib/schema";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { org, shell } = await loadApp();
  const { status } = await searchParams;
  const filters = [eq(invoices.organizationId, org.id)];
  if (status) filters.push(eq(invoices.status, status));
  const rows = await db()
    .select({ invoice: invoices, customer: customers })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(...filters));
  const paid = await paidMap(org.id, rows.map((r) => r.invoice.id));

  const tabs = [
    { key: "", name: "All", href: "/invoices" },
    ...INVOICE_STATUSES.map((s) => ({ key: s, name: label(s), href: `/invoices?status=${s}` })),
  ];

  return (
    <Shell
      {...shell}
      path="/invoices"
      title="Invoices"
      sub={<p className="page-sub">An invoice is paid only when the balance reaches zero.</p>}
      actions={<a className="btn" href="/invoices/new">New invoice</a>}
    >
      <Tabs tabs={tabs} active={status || ""} />
      {rows.length ? (
        <div className="card card-flush table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th className="right">Total</th>
                <th className="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice, customer }) => (
                <tr key={invoice.id}>
                  <td><a className="rowlink" href={`/invoices/${invoice.id}`}>{invoice.number}</a></td>
                  <td>{displayName(customer)}</td>
                  <td>{prettyDate(invoice.issueDate)}</td>
                  <td>{prettyDate(invoice.dueDate)}</td>
                  <td><Badge status={invoice.status} /></td>
                  <td className="right money">{formatMoney(invoice.totalCents)}</td>
                  <td className="right money">
                    {formatMoney(balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No invoices here"
          body="Bill a finished job, or start a fresh invoice for a customer."
          href="/invoices/new"
          action="New invoice"
        />
      )}
    </Shell>
  );
}

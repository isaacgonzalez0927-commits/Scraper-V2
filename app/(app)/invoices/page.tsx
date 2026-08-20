import { and, eq } from "drizzle-orm";
import { Badge, Empty, RecordTable, Tabs } from "@/components/ui";
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
        <RecordTable
          columns={[
            { label: "Number" },
            { label: "Customer" },
            { label: "Issued" },
            { label: "Due" },
            { label: "Status" },
            { label: "Total", align: "right" },
            { label: "Balance", align: "right" },
          ]}
          records={rows.map(({ invoice, customer }) => {
            const balance = balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status);
            return {
              key: invoice.id,
              href: `/invoices/${invoice.id}`,
              cells: [
                <a className="rowlink" href={`/invoices/${invoice.id}`}>{invoice.number}</a>,
                displayName(customer),
                prettyDate(invoice.issueDate),
                prettyDate(invoice.dueDate),
                <Badge status={invoice.status} />,
                <span className="money">{formatMoney(invoice.totalCents)}</span>,
                <span className="money">{formatMoney(balance)}</span>,
              ],
              phone: {
                title: `${invoice.number} · ${displayName(customer)}`,
                meta: `Due ${prettyDate(invoice.dueDate)}`,
                badge: <Badge status={invoice.status} />,
                amount: formatMoney(balance > 0 ? balance : invoice.totalCents),
                amountNote: balance > 0 ? "due" : "paid",
              },
            };
          })}
        />
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

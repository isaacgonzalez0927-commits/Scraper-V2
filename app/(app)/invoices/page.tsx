import { and, asc, desc, eq } from "drizzle-orm";
import { Badge, Empty, RecordTable, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { balanceCents, deriveStatus } from "@/lib/finance";
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
  const { org, shell, voice } = await loadApp();
  const { status } = await searchParams;
  const allRows = await db()
    .select({ invoice: invoices, customer: customers })
    .from(invoices)
    .innerJoin(
      customers,
      and(eq(customers.id, invoices.customerId), eq(customers.organizationId, org.id)),
    )
    .where(eq(invoices.organizationId, org.id))
    .orderBy(asc(invoices.dueDate), desc(invoices.issueDate));
  const paid = await paidMap(org.id, allRows.map((r) => r.invoice.id));
  const rows = allRows
    .map((row) => ({
      ...row,
      effectiveStatus: deriveStatus({
        ...row.invoice,
        paidCents: paid.get(row.invoice.id) || 0,
      }),
    }))
    .filter((row) => !status || row.effectiveStatus === status);

  const tabs = [
    { key: "", name: "All", href: "/invoices" },
    ...INVOICE_STATUSES.map((s) => ({ key: s, name: label(s), href: `/invoices?status=${s}` })),
  ];

  return (
    <Shell
      {...shell}
      path="/invoices"
      title="Invoices"
      sub={<p className="page-sub">{voice.invoicesSub}</p>}
      actions={
        <>
          <a className="btn btn-secondary" href="/api/export/invoices">Export CSV</a>
          <a className="btn" href="/invoices/new">New invoice</a>
        </>
      }
    >
      <Tabs tabs={tabs} active={status || ""} />
      {rows.length ? (
        <RecordTable
          columns={[
            { label: "Number" },
            { label: voice.customer },
            { label: "Issued" },
            { label: "Due" },
            { label: "Status" },
            { label: "Total", align: "right" },
            { label: "Balance", align: "right" },
          ]}
          records={rows.map(({ invoice, customer, effectiveStatus }) => {
            const balance = balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status);
            return {
              key: invoice.id,
              href: `/invoices/${invoice.id}`,
              cells: [
                <a className="rowlink" href={`/invoices/${invoice.id}`}>{invoice.number}</a>,
                displayName(customer),
                prettyDate(invoice.issueDate),
                prettyDate(invoice.dueDate),
                <Badge status={effectiveStatus} />,
                <span className="money">{formatMoney(invoice.totalCents)}</span>,
                <span className="money">{formatMoney(balance)}</span>,
              ],
              phone: {
                title: `${invoice.number} · ${displayName(customer)}`,
                meta: `Due ${prettyDate(invoice.dueDate)}`,
                badge: <Badge status={effectiveStatus} />,
                amount: formatMoney(balance > 0 ? balance : invoice.totalCents),
                amountNote: balance > 0 ? "due" : "paid",
              },
            };
          })}
        />
      ) : (
        <Empty
          title="No invoices here"
          body={`Bill a finished ${voice.job.toLowerCase()}, or start a fresh invoice.`}
          href="/invoices/new"
          action="New invoice"
        />
      )}
    </Shell>
  );
}

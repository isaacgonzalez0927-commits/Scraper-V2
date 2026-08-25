import { and, desc, eq } from "drizzle-orm";
import { Badge, Empty, RecordTable, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { ESTIMATE_STATUSES, label, prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { customers, estimates } from "@/lib/schema";

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { status } = await searchParams;
  const filters = [eq(estimates.organizationId, org.id)];
  if (status && ESTIMATE_STATUSES.includes(status as (typeof ESTIMATE_STATUSES)[number])) {
    filters.push(eq(estimates.status, status));
  }
  const rows = await db()
    .select({ estimate: estimates, customer: customers })
    .from(estimates)
    .innerJoin(
      customers,
      and(eq(customers.id, estimates.customerId), eq(customers.organizationId, org.id)),
    )
    .where(and(...filters))
    .orderBy(desc(estimates.createdAt));
  const tabs = [
    { key: "", name: "All", href: "/estimates" },
    ...ESTIMATE_STATUSES.map((item) => ({
      key: item,
      name: label(item),
      href: `/estimates?status=${item}`,
    })),
  ];

  return (
    <Shell
      {...shell}
      path="/estimates"
      title="Estimates"
      sub={<p className="page-sub">Send pricing for customer approval before scheduling work.</p>}
      actions={<a className="btn" href="/estimates/new">New estimate</a>}
    >
      <Tabs tabs={tabs} active={status || ""} />
      {rows.length ? (
        <RecordTable
          columns={[
            { label: "Number" },
            { label: voice.customer },
            { label: "Issued" },
            { label: "Valid until" },
            { label: "Status" },
            { label: "Total", align: "right" },
          ]}
          records={rows.map(({ estimate, customer }) => ({
            key: estimate.id,
            href: `/estimates/${estimate.id}`,
            cells: [
              <a className="rowlink" href={`/estimates/${estimate.id}`}>{estimate.number}</a>,
              displayName(customer),
              prettyDate(estimate.issueDate),
              prettyDate(estimate.validUntil),
              <Badge status={estimate.status} />,
              <span className="money">{formatMoney(estimate.totalCents)}</span>,
            ],
            phone: {
              title: `${estimate.number} · ${displayName(customer)}`,
              meta: `Valid until ${prettyDate(estimate.validUntil)}`,
              badge: <Badge status={estimate.status} />,
              amount: formatMoney(estimate.totalCents),
              amountNote: "estimate",
            },
          }))}
        />
      ) : (
        <Empty
          title="No estimates here"
          body="Create an estimate when a customer needs to approve pricing before work starts."
          href="/estimates/new"
          action="New estimate"
        />
      )}
    </Shell>
  );
}

import { and, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { Empty, RecordTable, SearchField, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { prettyDate } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { customerBalanceCents, customerLifetimeCents } from "@/lib/queries";
import { customers } from "@/lib/schema";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const q = await searchParams;
  const archived = q.show === "archived";
  const term = (q.q || "").trim();
  const filters = [
    eq(customers.organizationId, org.id),
    archived ? isNotNull(customers.archivedAt) : isNull(customers.archivedAt),
  ];
  if (term) {
    const likeTerm = `%${term.replace(/[%_]/g, "")}%`;
    filters.push(
      or(
        like(customers.name, likeTerm),
        like(customers.companyName, likeTerm),
        like(customers.email, likeTerm),
        like(customers.phone, likeTerm),
      )!,
    );
  }
  const rows = await db().select().from(customers).where(and(...filters));
  const cards = await Promise.all(
    rows.map(async (customer) => ({
      customer,
      revenue: await customerLifetimeCents(org.id, customer.id),
      balance: await customerBalanceCents(org.id, customer.id),
    })),
  );

  return (
    <Shell
      {...shell}
      path="/customers"
      title={voice.customers}
      sub={<p className="page-sub">{voice.customersSub}</p>}
      actions={<a className="btn" href="/customers/new">{voice.newCustomer}</a>}
    >
      <div className="toolbar">
        <Tabs
          tabs={[
            { key: "active", name: "Active", href: "/customers" },
            { key: "archived", name: "Archived", href: "/customers?show=archived" },
          ]}
          active={archived ? "archived" : "active"}
        />
        <SearchField
          value={term}
          placeholder="Name, phone, or email"
          hidden={archived ? { show: "archived" } : undefined}
        />
      </div>

      {cards.length ? (
        <RecordTable
          columns={[
            { label: voice.customer },
            { label: "Contact" },
            { label: voice.sinceLabel },
            { label: "Paid to date", align: "right" },
            { label: "Outstanding", align: "right" },
          ]}
          records={cards.map(({ customer, revenue, balance }) => ({
            key: customer.id,
            href: `/customers/${customer.id}`,
            cells: [
              <>
                <a className="rowlink" href={`/customers/${customer.id}`}>{displayName(customer)}</a>
                <div className="tiny">
                  {formatAddress("", customer.serviceCity, customer.serviceState, customer.servicePostal)}
                </div>
              </>,
              <>
                {customer.phone}
                <div className="tiny">{customer.email}</div>
              </>,
              prettyDate(customer.customerSince),
              <span className="money">{formatMoney(revenue)}</span>,
              <span className="money">{formatMoney(balance)}</span>,
            ],
            phone: {
              title: displayName(customer),
              meta: customer.phone || customer.email || "No contact details",
              amount: formatMoney(balance),
              amountNote: balance > 0 ? "outstanding" : "all paid",
            },
          }))}
        />
      ) : (
        <Empty
          title={term ? `No ${voice.customers.toLowerCase()} matched that search` : `No ${voice.customers.toLowerCase()} yet`}
          body={
            term
              ? "Try a phone number, a last name, or part of an email address."
              : voice.emptyCustomers
          }
          href="/customers/new"
          action={voice.newCustomer}
        />
      )}
    </Shell>
  );
}

import { and, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { Empty, SearchField, Tabs } from "@/components/ui";
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
  const { org, shell } = await loadApp();
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
      title="Customers"
      sub={<p className="page-sub">Who you work for, what they have paid, and what they still owe.</p>}
      actions={<a className="btn" href="/customers/new">New customer</a>}
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
        <div className="card card-flush table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Customer since</th>
                <th className="right">Paid to date</th>
                <th className="right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(({ customer, revenue, balance }) => (
                <tr key={customer.id}>
                  <td>
                    <a className="rowlink" href={`/customers/${customer.id}`}>{displayName(customer)}</a>
                    <div className="tiny">
                      {formatAddress("", customer.serviceCity, customer.serviceState, customer.servicePostal)}
                    </div>
                  </td>
                  <td>
                    {customer.phone}
                    <div className="tiny">{customer.email}</div>
                  </td>
                  <td>{prettyDate(customer.customerSince)}</td>
                  <td className="right money">{formatMoney(revenue)}</td>
                  <td className="right money">{formatMoney(balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={term ? "No customers matched that search" : "No customers yet"}
          body={
            term
              ? "Try a phone number, a last name, or part of an email address."
              : "Add the first one. A job and an invoice can follow in the next two screens."
          }
          href="/customers/new"
          action="New customer"
        />
      )}
    </Shell>
  );
}

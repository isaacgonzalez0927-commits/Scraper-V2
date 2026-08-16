import { and, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { Empty } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
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
      actions={<a className="btn" href="/customers/new">New customer</a>}
    >
      <form className="filters" method="get">
        <input
          name="q"
          defaultValue={term}
          placeholder="Search name, phone, email"
          style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "7px 12px", minWidth: 220 }}
        />
        {archived ? <input type="hidden" name="show" value="archived" /> : null}
        <a className={`chip ${archived ? "" : "active"}`} href="/customers">Active</a>
        <a className={`chip ${archived ? "active" : ""}`} href="/customers?show=archived">Archived</a>
        <button className="btn btn-secondary btn-sm" type="submit">Search</button>
      </form>
      {cards.length ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Since</th>
                <th className="right">Lifetime</th>
                <th className="right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(({ customer, revenue, balance }) => (
                <tr key={customer.id}>
                  <td>
                    <a className="rowlink" href={`/customers/${customer.id}`}>{displayName(customer)}</a>
                    <div className="tiny">{customer.serviceCity} {customer.serviceState}</div>
                  </td>
                  <td>{customer.phone}<div className="tiny">{customer.email}</div></td>
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
          title="No customers yet"
          body="Add the first one. A job and an invoice can follow in the next two screens."
          href="/customers/new"
          action="New customer"
        />
      )}
    </Shell>
  );
}

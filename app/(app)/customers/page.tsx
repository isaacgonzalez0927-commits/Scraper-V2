import { and, asc, eq, inArray, isNotNull, isNull, like, or } from "drizzle-orm";
import { syncCustomersWithStripeAction } from "@/app/actions";
import { importCustomersAction } from "@/app/house-actions";
import { Banner, Empty, RecordTable, SearchField, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { loadCollectQueue } from "@/lib/collect-queue";
import { lastJobSummary } from "@/lib/customer-timeline";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { integrationStatus } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { prettyDate, prettyWhen } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { customerBalanceCents, customerLifetimeCents } from "@/lib/queries";
import { customers, jobs, properties } from "@/lib/schema";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string; ok?: string; error?: string }>;
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
    const propertyHits = await db()
      .select({ customerId: properties.customerId })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, org.id),
          or(
            like(properties.line1, likeTerm),
            like(properties.city, likeTerm),
            like(properties.notes, likeTerm),
            like(properties.details, likeTerm),
            like(properties.postal, likeTerm),
          ),
        ),
      );
    const extraIds = [...new Set(propertyHits.map((row) => row.customerId))];
    const clauses = [
      like(customers.name, likeTerm),
      like(customers.companyName, likeTerm),
      like(customers.email, likeTerm),
      like(customers.phone, likeTerm),
      like(customers.notes, likeTerm),
      like(customers.details, likeTerm),
      like(customers.serviceLine1, likeTerm),
      like(customers.billingLine1, likeTerm),
      like(customers.serviceCity, likeTerm),
    ];
    if (extraIds.length) clauses.push(inArray(customers.id, extraIds));
    filters.push(or(...clauses)!);
  }
  const [rows, integrations, jobRows, collectRows] = await Promise.all([
    db().select().from(customers).where(and(...filters)).orderBy(asc(customers.name)),
    integrationStatus(org.id),
    db().select().from(jobs).where(eq(jobs.organizationId, org.id)),
    loadCollectQueue(org.id),
  ]);
  const jobsByCustomer = new Map<number, typeof jobRows>();
  for (const job of jobRows) {
    const list = jobsByCustomer.get(job.customerId) || [];
    list.push(job);
    jobsByCustomer.set(job.customerId, list);
  }
  const collectIds = new Set(collectRows.map((row) => row.customerId));
  const cards = await Promise.all(
    rows.map(async (customer) => ({
      customer,
      revenue: await customerLifetimeCents(org.id, customer.id),
      balance: await customerBalanceCents(org.id, customer.id),
      lastJob: lastJobSummary(jobsByCustomer.get(customer.id) || []),
      collect: collectIds.has(customer.id),
    })),
  );
  cards.sort((a, b) => {
    const markA = a.collect ? 0 : 1;
    const markB = b.collect ? 0 : 1;
    if (markA !== markB) return markA - markB;
    if (b.balance !== a.balance) return b.balance - a.balance;
    return displayName(a.customer).localeCompare(displayName(b.customer));
  });

  return (
    <Shell
      {...shell}
      path="/customers"
      title={voice.customers}
      sub={<p className="page-sub">{voice.customersSub}</p>}
      actions={
        <>
          {integrations.stripe.connected ? (
            <form action={syncCustomersWithStripeAction}>
              <button className="btn btn-secondary" type="submit">
                Sync with Stripe
              </button>
            </form>
          ) : null}
          <a className="btn btn-secondary" href="/api/export/customers">
            Export CSV
          </a>
          <a className="btn" href="/customers/new">{voice.newCustomer}</a>
        </>
      }
    >
      <Banner error={q.error} ok={q.ok} />
      {integrations.stripe.connected ? (
        <p className="help">
          Saving a customer here creates them in Stripe. New Stripe customers
          come back through the webhook, or tap Sync with Stripe to pull the
          ones already there.
        </p>
      ) : null}

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
          placeholder="Name, phone, address, notes"
          hidden={archived ? { show: "archived" } : undefined}
        />
      </div>

      <details className="disclosure">
        <summary>Import from Jobber or Housecall Pro</summary>
        <p className="help mt-1">
          CSV with a name column. Duplicate email, phone, or name plus street is skipped.
        </p>
        <form action={importCustomersAction} className="row mt-1">
          <input className="input" type="file" name="file" accept=".csv,text/csv" required />
          <button className="btn btn-secondary btn-sm" type="submit">
            Import CSV
          </button>
        </form>
      </details>

      {cards.length ? (
        <RecordTable
          columns={[
            { label: voice.customer },
            { label: "Contact" },
            { label: "Last job" },
            { label: "Paid to date", align: "right" },
            { label: "Outstanding", align: "right" },
          ]}
          records={cards.map(({ customer, revenue, balance, lastJob, collect }) => ({
            key: customer.id,
            href: `/customers/${customer.id}`,
            cells: [
              <>
                <a className="rowlink" href={`/customers/${customer.id}`}>{displayName(customer)}</a>
                <div className="tiny">
                  {formatAddress("", customer.serviceCity, customer.serviceState, customer.servicePostal)}
                  {collect ? " · Collect" : ""}
                  {customer.stripeCustomerId ? " · Stripe" : ""}
                </div>
              </>,
              <>
                {customer.phone}
                <div className="tiny">{customer.email}</div>
              </>,
              lastJob ? (
                <>
                  {lastJob.title}
                  <div className="tiny">{prettyWhen(lastJob.at) || prettyDate(lastJob.at.slice(0, 10))}</div>
                </>
              ) : (
                "None"
              ),
              <span className="money">{formatMoney(revenue)}</span>,
              <span className="money">{formatMoney(balance)}</span>,
            ],
            phone: {
              title: displayName(customer),
              meta: [
                customer.phone || customer.email || "No contact details",
                lastJob ? lastJob.title : "",
                collect ? "Collect" : "",
              ]
                .filter(Boolean)
                .join(" · "),
              amount: formatMoney(balance),
              amountNote: balance > 0 ? "outstanding" : collect ? "collect" : "all paid",
            },
          }))}
        />
      ) : (
        <Empty
          title={term ? `No ${voice.customers.toLowerCase()} matched that search` : `No ${voice.customers.toLowerCase()} yet`}
          body={
            term
              ? "Try a phone number, a street, a last name, or a note."
              : voice.emptyCustomers
          }
          href="/customers/new"
          action={voice.newCustomer}
        />
      )}
    </Shell>
  );
}

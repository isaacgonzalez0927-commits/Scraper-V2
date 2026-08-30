import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { balanceCents } from "@/lib/finance";
import { prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { paidMap } from "@/lib/queries";
import { customers, estimates, invoices, organizations } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomerHubPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await boot();
  const { token } = await params;
  if (!token) notFound();
  const [customer] = await db().select().from(customers).where(eq(customers.publicToken, token));
  if (!customer || !customer.publicToken) notFound();
  const [org] = await db()
    .select()
    .from(organizations)
    .where(eq(organizations.id, customer.organizationId));
  if (!org) notFound();

  const [estimateRows, invoiceRows] = await Promise.all([
    db()
      .select()
      .from(estimates)
      .where(
        and(
          eq(estimates.organizationId, org.id),
          eq(estimates.customerId, customer.id),
          inArray(estimates.status, ["sent", "viewed", "approved"]),
          isNull(estimates.convertedJobId),
        ),
      ),
    db()
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, org.id),
          eq(invoices.customerId, customer.id),
          ne(invoices.status, "void"),
          ne(invoices.status, "draft"),
          ne(invoices.status, "paid"),
        ),
      ),
  ]);
  const paid = await paidMap(
    org.id,
    invoiceRows.map((row) => row.id),
  );
  const unpaid = invoiceRows
    .map((invoice) => ({
      invoice,
      remaining: balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status),
    }))
    .filter((row) => row.remaining > 0);

  return (
    <div className="sheet-page">
      <div className="sheet">
        <div className="sheet-head">
          <div>
            <div className="brand">
              <BrandLogo className="brand-mark" crop="icon" />
              <span className="brand-name">{org.name}</span>
            </div>
            <p className="tiny">For {displayName(customer)}</p>
          </div>
        </div>
        <p className="muted">
          Open estimates and unpaid invoices. This is not a booking page.
        </p>

        <h2 className="card-title mt-2">Estimates</h2>
        {estimateRows.length ? (
          <ul className="rows">
            {estimateRows.map((estimate) => (
              <li key={estimate.id}>
                <a className="row-item" href={`/p/est/${estimate.publicToken}`}>
                  <span className="row-main">
                    <span className="row-title">{estimate.number}</span>
                    <span className="row-meta">Valid until {prettyDate(estimate.validUntil)}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-amount">{formatMoney(estimate.totalCents)}</span>
                    <Badge status={estimate.status} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No open estimates.</p>
        )}

        <h2 className="card-title mt-2">Invoices</h2>
        {unpaid.length ? (
          <ul className="rows">
            {unpaid.map(({ invoice, remaining }) => (
              <li key={invoice.id}>
                <a className="row-item" href={`/p/inv/${invoice.publicToken}`}>
                  <span className="row-main">
                    <span className="row-title">{invoice.number}</span>
                    <span className="row-meta">Due {prettyDate(invoice.dueDate)}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-amount">{formatMoney(remaining)}</span>
                    <Badge status={invoice.status} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No unpaid invoices.</p>
        )}
      </div>
    </div>
  );
}

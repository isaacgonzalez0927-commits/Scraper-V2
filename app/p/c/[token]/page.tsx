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
import { rows } from "@/lib/operations";

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

  const [estimateRows, invoiceRows, upcomingJobs, agreements, equipment, booking] = await Promise.all([
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
    rows<{id:number;title:string;scheduledStart:string;status:string}>("SELECT id,title,scheduled_start,status FROM jobs WHERE organization_id=? AND customer_id=? AND scheduled_start>=? AND status IN ('scheduled','in_progress') ORDER BY scheduled_start LIMIT 10",[org.id,customer.id,new Date().toISOString().slice(0,10)]),
    rows<{id:number;name:string;nextVisit:string;status:string}>("SELECT id,name,next_visit,status FROM service_agreements WHERE organization_id=? AND customer_id=? AND status='active' ORDER BY next_visit",[org.id,customer.id]),
    rows<{id:number;name:string;model:string;warrantyUntil:string;nextService:string}>("SELECT id,name,model,warranty_until,next_service FROM equipment_assets WHERE organization_id=? AND customer_id=? ORDER BY name",[org.id,customer.id]),
    rows<{bookingEnabled:number}>("SELECT booking_enabled FROM operations_settings WHERE organization_id=?",[org.id]),
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
        <p className="muted">Your appointments, service plans, estimates, and invoices with {org.name}.</p>

        <h2 className="card-title mt-2">Upcoming appointments</h2>
        {upcomingJobs.length?<ul className="rows">{upcomingJobs.map(job=><li key={job.id}><div className="row-item"><span className="row-main"><span className="row-title">{job.title}</span><span className="row-meta">{prettyDate(job.scheduledStart.slice(0,10))} · {job.scheduledStart.slice(11,16)}</span></span><Badge status={job.status}/></div></li>)}</ul>:<p className="muted">No upcoming appointments.</p>}
        {booking[0]?.bookingEnabled?<p className="mt-1"><a className="btn btn-secondary btn-sm" href={`/book/${org.slug}`}>Request service</a></p>:null}

        {agreements.length?<><h2 className="card-title mt-2">Service plans</h2><ul className="rows">{agreements.map(plan=><li key={plan.id}><div className="row-item"><span className="row-main"><span className="row-title">{plan.name}</span><span className="row-meta">Next service due {prettyDate(plan.nextVisit)}</span></span><Badge status={plan.status}/></div></li>)}</ul></>:null}

        {equipment.length?<><h2 className="card-title mt-2">Equipment on file</h2><ul className="rows">{equipment.map(item=><li key={item.id}><div className="row-item"><span className="row-main"><span className="row-title">{item.name}</span><span className="row-meta">{item.model||'Model not recorded'}{item.nextService?` · Next service ${prettyDate(item.nextService)}`:''}</span></span></div></li>)}</ul></>:null}

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

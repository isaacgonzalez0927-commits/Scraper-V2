import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { addNoteAction, archiveCustomerAction } from "@/app/actions";
import { Badge } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { prettyDate, prettyWhen } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { customerBalanceCents, customerLifetimeCents } from "@/lib/queries";
import { customers, invoices, jobs, notes, payments } from "@/lib/schema";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, Number(id)), eq(customers.organizationId, org.id)));
  if (!customer) notFound();
  const [lifetime, balance, jobRows, invoiceRows, paymentRows, noteRows] = await Promise.all([
    customerLifetimeCents(org.id, customer.id),
    customerBalanceCents(org.id, customer.id),
    db().select().from(jobs).where(and(eq(jobs.organizationId, org.id), eq(jobs.customerId, customer.id))),
    db().select().from(invoices).where(and(eq(invoices.organizationId, org.id), eq(invoices.customerId, customer.id))),
    db().select().from(payments).where(and(eq(payments.organizationId, org.id), eq(payments.customerId, customer.id))),
    db()
      .select()
      .from(notes)
      .where(and(eq(notes.organizationId, org.id), eq(notes.customerId, customer.id)))
      .orderBy(desc(notes.createdAt)),
  ]);

  return (
    <Shell
      {...shell}
      path="/customers"
      title={displayName(customer)}
      sub={
        <p className="page-sub">
          Customer since {prettyDate(customer.customerSince)}
          {customer.archivedAt ? " · Archived" : ""}
        </p>
      }
      actions={
        <>
          <a className="btn" href={`/jobs/new?customerId=${customer.id}`}>New job</a>
          <a className="btn btn-secondary" href={`/invoices/new?customerId=${customer.id}`}>Invoice</a>
          <a className="btn btn-ghost" href={`/customers/${customer.id}/edit`}>Edit</a>
        </>
      }
    >
      <div className="grid grid-3">
        <article className="card">
          <p className="stat-label">Lifetime value</p>
          <p className="stat-value money">{formatMoney(lifetime)}</p>
          <p className="stat-note">Payments received</p>
        </article>
        <article className="card">
          <p className="stat-label">Outstanding</p>
          <p className="stat-value money">{formatMoney(balance)}</p>
        </article>
        <article className="card">
          <div className="card-title">Contact</div>
          <p>{customer.phone || "—"}<br />{customer.email || "—"}</p>
          <p className="tiny">
            Billing: {formatAddress(customer.billingLine1, customer.billingCity, customer.billingState, customer.billingPostal) || "—"}
          </p>
          <p className="tiny">
            Service: {formatAddress(customer.serviceLine1, customer.serviceCity, customer.serviceState, customer.servicePostal) || "—"}
          </p>
          {customer.notes ? <p>{customer.notes}</p> : null}
          <form action={archiveCustomerAction}>
            <input type="hidden" name="id" value={customer.id} />
            <button className="btn btn-ghost btn-sm" type="submit">
              {customer.archivedAt ? "Restore" : "Archive"}
            </button>
          </form>
        </article>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Jobs</div>
          {jobRows.length ? jobRows.map((job) => (
            <div key={job.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0eeea" }}>
              <a href={`/jobs/${job.id}`}>{job.title}</a>{" "}
              <Badge status={job.status} />
              <div className="tiny">{prettyWhen(job.scheduledStart)}</div>
            </div>
          )) : <p className="muted">No jobs yet.</p>}
        </section>
        <section className="card">
          <div className="card-title">Invoices</div>
          {invoiceRows.length ? invoiceRows.map((inv) => (
            <div key={inv.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0eeea", display: "flex", justifyContent: "space-between" }}>
              <div>
                <a href={`/invoices/${inv.id}`}>{inv.number}</a>{" "}
                <Badge status={inv.status} />
              </div>
              <span className="money">{formatMoney(inv.totalCents)}</span>
            </div>
          )) : <p className="muted">No invoices yet.</p>}
        </section>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Payments</div>
          {paymentRows.length ? paymentRows.map((p) => (
            <div key={p.id} style={{ padding: "8px 0", display: "flex", justifyContent: "space-between" }}>
              <a href={`/payments/${p.id}`}>{prettyDate(p.paidOn)} · {p.method}</a>
              <span className="money">{formatMoney(p.amountCents)}</span>
            </div>
          )) : <p className="muted">No payments yet.</p>}
        </section>
        <section className="card">
          <div className="card-title">Notes</div>
          <form action={addNoteAction}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="field"><textarea name="body" placeholder="Add a note" /></div>
            <button className="btn btn-secondary btn-sm" type="submit">Save note</button>
          </form>
          {noteRows.map((note) => (
            <p key={note.id} style={{ marginTop: 12 }}>
              {note.body}<br />
              <span className="tiny">{prettyWhen(note.createdAt)}</span>
            </p>
          ))}
        </section>
      </div>
    </Shell>
  );
}

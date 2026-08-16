import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { sendInvoiceAction, voidInvoiceAction } from "@/app/actions";
import { Badge, Flash } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName, publicBaseUrl } from "@/lib/display";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { prettyDate, prettyWhen } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { customers, invoiceEvents, invoiceLines, invoices, jobs } from "@/lib/schema";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const q = await searchParams;
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, Number(id)), eq(invoices.organizationId, org.id)));
  if (!invoice) notFound();
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  const [lines, events, job] = await Promise.all([
    db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id)),
    db().select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoice.id)).orderBy(desc(invoiceEvents.createdAt)),
    invoice.jobId
      ? db().select().from(jobs).where(eq(jobs.id, invoice.jobId)).then((rows) => rows[0])
      : Promise.resolve(undefined),
  ]);
  const paid = await amountPaidCents(invoice.id);
  const balance = balanceCents(invoice.totalCents, paid, invoice.status);
  const origin = publicBaseUrl();
  const publicUrl = `${origin || ""}/p/inv/${invoice.publicToken}`;
  const locked = invoice.status === "paid" || invoice.status === "void";

  return (
    <Shell
      {...shell}
      path="/invoices"
      title={invoice.number}
      sub={
        <p className="page-sub">
          <a href={`/customers/${invoice.customerId}`}>{displayName(customer)}</a>
          {" · "}
          <Badge status={invoice.status} />
        </p>
      }
      actions={
        <>
          <a className="btn btn-secondary" href={`/invoices/${invoice.id}/preview`}>Preview</a>
          {!locked ? (
            <>
              <a className="btn" href={`/payments/new?invoiceId=${invoice.id}`}>Record payment</a>
              <form action={sendInvoiceAction}>
                <input type="hidden" name="id" value={invoice.id} />
                <button className="btn" type="submit">Mark sent</button>
              </form>
              <a className="btn btn-ghost" href={`/invoices/${invoice.id}/edit`}>Edit</a>
            </>
          ) : null}
        </>
      }
    >
      <Flash error={q.error} notice={q.notice} />
      <div className="grid grid-4">
        <article className="card"><p className="stat-label">Total</p><p className="stat-value money">{formatMoney(invoice.totalCents)}</p></article>
        <article className="card"><p className="stat-label">Paid</p><p className="stat-value money">{formatMoney(paid)}</p></article>
        <article className="card"><p className="stat-label">Remaining</p><p className="stat-value money">{formatMoney(balance)}</p></article>
        <article className="card"><p className="stat-label">Due</p><p className="stat-value" style={{ fontSize: 22 }}>{prettyDate(invoice.dueDate)}</p></article>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Line items</div>
          <table className="data">
            <thead>
              <tr><th>Description</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Amount</th></tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td className="right">{line.quantity}</td>
                  <td className="right money">{formatMoney(line.unitPriceCents)}</td>
                  <td className="right money">{formatMoney(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny">
            Subtotal {formatMoney(invoice.subtotalCents)}
            {invoice.discountCents ? ` · Discount ${formatMoney(invoice.discountCents)}` : ""}
            {" · "}Tax {formatMoney(invoice.taxCents)}
          </p>
          {job ? <p>Job: <a href={`/jobs/${job.id}`}>{job.title}</a></p> : null}
          {invoice.notes ? <p>{invoice.notes}</p> : null}
          <div className="notice" style={{ marginTop: 14 }}>
            Customer link: <a href={publicUrl}>{publicUrl || `/p/inv/${invoice.publicToken}`}</a>
            <br />
            {process.env.SERE_SMTP_HOST
              ? "SMTP is configured."
              : "Set SERE_SMTP_HOST to email invoices. Mark sent still works without it."}
            {" "}
            {process.env.STRIPE_SECRET_KEY
              ? "Stripe keys are present."
              : "Card links need STRIPE_SECRET_KEY."}
          </div>
          {!locked && paid === 0 ? (
            <form action={voidInvoiceAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={invoice.id} />
              <button className="btn btn-ghost btn-sm" type="submit">Void invoice</button>
            </form>
          ) : null}
        </section>
        <section className="card">
          <div className="card-title">Activity</div>
          <ul className="timeline">
            {events.length ? events.map((event) => (
              <li key={event.id}>
                <strong>{event.message}</strong>
                {event.amountCents ? <span className="money"> · {formatMoney(event.amountCents)}</span> : null}
                <div className="tiny">{prettyWhen(event.createdAt)}</div>
              </li>
            )) : (
              <li>Invoice created<div className="tiny">{prettyWhen(invoice.createdAt)}</div></li>
            )}
          </ul>
          <p style={{ marginTop: 16 }}><strong>Remaining balance: {formatMoney(balance)}</strong></p>
        </section>
      </div>
    </Shell>
  );
}

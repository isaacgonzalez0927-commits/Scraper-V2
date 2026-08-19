import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { sendInvoiceAction, voidInvoiceAction } from "@/app/actions";
import { ConnectStripeButton } from "@/components/ConnectStripe";
import { Badge, Banner, Card, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { integrationStatus } from "@/lib/integrations";
import { prettyDate, prettyWhen } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { absoluteBaseUrl } from "@/lib/url";
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
  const [lines, events, job, integrations, base] = await Promise.all([
    db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id)),
    db().select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoice.id)).orderBy(desc(invoiceEvents.createdAt)),
    invoice.jobId
      ? db().select().from(jobs).where(eq(jobs.id, invoice.jobId)).then((rows) => rows[0])
      : Promise.resolve(undefined),
    integrationStatus(org.id),
    absoluteBaseUrl(),
  ]);
  const paid = await amountPaidCents(invoice.id);
  const balance = balanceCents(invoice.totalCents, paid, invoice.status);
  const publicPath = `/p/inv/${invoice.publicToken}`;
  const publicUrl = `${base}${publicPath}`;
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
          {prettyDate(invoice.issueDate)}
        </p>
      }
      actions={
        <>
          <Badge status={invoice.status} />
          <a className="btn btn-secondary" href={`/invoices/${invoice.id}/preview`}>Preview</a>
          {!locked ? (
            <>
              <a className="btn btn-secondary" href={`/invoices/${invoice.id}/edit`}>Edit</a>
              <form action={sendInvoiceAction}>
                <input type="hidden" name="id" value={invoice.id} />
                <button className="btn btn-secondary" type="submit">
                  {integrations.email.connected ? "Email invoice" : "Mark sent"}
                </button>
              </form>
              <a className="btn" href={`/payments/new?invoiceId=${invoice.id}`}>Record payment</a>
            </>
          ) : null}
        </>
      }
    >
      <Banner error={q.error} info={q.notice} />

      <div className="grid grid-4">
        <Stat label="Total" value={formatMoney(invoice.totalCents)} />
        <Stat label="Paid" value={formatMoney(paid)} tone={paid > 0 ? "good" : undefined} />
        <Stat label="Balance due" value={formatMoney(balance)} tone={balance > 0 ? "bad" : undefined} />
        <Stat label="Due date" value={prettyDate(invoice.dueDate)} small note={`Terms: ${org.paymentTermsDays} days`} />
      </div>

      <div className="grid grid-2 mt-2">
        <Card title="Line items">
          <div className="table-wrap">
            <table className="data table-inline">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="right">Qty</th>
                  <th className="right">Price</th>
                  <th className="right">Amount</th>
                </tr>
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
          </div>
          <div className="sheet-totals">
            <div className="sheet-total-row"><span>Subtotal</span><span>{formatMoney(invoice.subtotalCents)}</span></div>
            {invoice.discountCents ? (
              <div className="sheet-total-row"><span>Discount</span><span>{formatMoney(-invoice.discountCents)}</span></div>
            ) : null}
            <div className="sheet-total-row"><span>Tax</span><span>{formatMoney(invoice.taxCents)}</span></div>
            <div className="sheet-total-row due"><span>Total</span><span>{formatMoney(invoice.totalCents)}</span></div>
          </div>
          {job ? <p className="tiny mt-2">From job <a href={`/jobs/${job.id}`}>{job.title}</a></p> : null}
          {invoice.notes ? <p className="muted mt-2">{invoice.notes}</p> : null}
          {!locked && paid === 0 ? (
            <form action={voidInvoiceAction} className="mt-2">
              <input type="hidden" name="id" value={invoice.id} />
              <button className="btn btn-ghost btn-sm" type="submit">Void this invoice</button>
            </form>
          ) : null}
        </Card>

        <div className="col">
          <Card title="Customer link" note="Anyone with this link can view and pay the invoice.">
            <div className="copy-row">
              <a className="copy-value" href={publicPath} target="_blank" rel="noreferrer">
                {publicUrl || publicPath}
              </a>
              <button className="btn btn-secondary btn-sm" type="button" data-copy={publicUrl || publicPath}>
                Copy
              </button>
            </div>
            {!integrations.stripe.connected && !shell.isDemo ? (
              <div className="connect-cta connect-cta-flush mt-2">
                <div>
                  <strong>Stripe is the main pay button.</strong>
                  <p>Customers tap Pay with Stripe on the invoice. Square and PayPal can sit underneath if those are connected too.</p>
                </div>
                <ConnectStripeButton large />
              </div>
            ) : null}
            <div className="kv mt-2">
              <div className="kv-row">
                <span className="kv-key">Card payments</span>
                <span className="kv-value">
                  {integrations.stripe.connected
                    ? "On through Stripe"
                    : shell.isDemo
                      ? <a href="/signup">Create your shop</a>
                      : "Stripe not connected"}
                </span>
              </div>
              {integrations.square.connected ? (
                <div className="kv-row">
                  <span className="kv-key">Square</span>
                  <span className="kv-value">Also on · {integrations.square.label}</span>
                </div>
              ) : null}
              {integrations.paypal.connected ? (
                <div className="kv-row">
                  <span className="kv-key">PayPal</span>
                  <span className="kv-value">Also on · {integrations.paypal.label}</span>
                </div>
              ) : null}
              <div className="kv-row">
                <span className="kv-key">Email delivery</span>
                <span className="kv-value">
                  {integrations.email.connected ? `From ${integrations.email.label}` : <a href="/settings?tab=integrations">Connect email</a>}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Activity">
            <ul className="timeline">
              {events.length ? events.map((event) => (
                <li key={event.id}>
                  <strong>{event.message}</strong>
                  <div className="tiny">{prettyWhen(event.createdAt)}</div>
                </li>
              )) : (
                <li>
                  Invoice created
                  <div className="tiny">{prettyWhen(invoice.createdAt)}</div>
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

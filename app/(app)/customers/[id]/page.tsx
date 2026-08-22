import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { addNoteAction, archiveCustomerAction } from "@/app/actions";
import { Badge, Banner, Blank, Card, KeyValue, RowLink, Rows, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { integrationStatus, stripeConfig } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { label, prettyDate, prettyWhen } from "@/lib/labels";
import { filledDetails, parseDetails, tradeFieldsFor } from "@/lib/business";
import { loadApp } from "@/lib/page";
import { customerBalanceCents, customerLifetimeCents } from "@/lib/queries";
import { stripeDashboardCustomerUrl } from "@/lib/stripe-customers";
import { customers, invoices, jobs, notes, payments } from "@/lib/schema";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { id } = await params;
  const q = await searchParams;
  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, Number(id)), eq(customers.organizationId, org.id)));
  if (!customer) notFound();
  const [lifetime, balance, jobRows, invoiceRows, paymentRows, noteRows, integrations, stripe] =
    await Promise.all([
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
    integrationStatus(org.id),
    stripeConfig(org.id),
  ]);

  const billing = formatAddress(customer.billingLine1, customer.billingCity, customer.billingState, customer.billingPostal);
  const service = formatAddress(customer.serviceLine1, customer.serviceCity, customer.serviceState, customer.servicePostal);
  const siteRows = filledDetails(
    parseDetails(customer.details),
    tradeFieldsFor(org.businessType, "customer"),
  );

  return (
    <Shell
      {...shell}
      path="/customers"
      title={displayName(customer)}
      sub={
        <p className="page-sub">
          {voice.sinceLabel} {prettyDate(customer.customerSince)}
          {customer.archivedAt ? " · Archived" : ""}
        </p>
      }
      actions={
        <>
          <a className="btn btn-secondary" href={`/customers/${customer.id}/edit`}>Edit</a>
          <a className="btn btn-secondary" href={`/invoices/new?customerId=${customer.id}`}>New invoice</a>
          <a className="btn" href={`/jobs/new?customerId=${customer.id}`}>{voice.newJob}</a>
        </>
      }
    >
      <Banner error={q.error} ok={q.ok} />
      <div className="grid grid-3">
        <Stat label="Paid to date" value={formatMoney(lifetime)} note="Payments received" tone="good" />
        <Stat
          label="Outstanding"
          value={formatMoney(balance)}
          note="Open invoice balances"
          tone={balance > 0 ? "bad" : undefined}
        />
        <Card title="Contact">
          <KeyValue
            rows={[
              [
                "Phone",
                customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : <Blank />,
              ],
              [
                "Email",
                customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : <Blank />,
              ],
              ["Billing", billing || <Blank />],
              [voice.siteLabel, service || <Blank text="Same as billing" />],
              [
                "Stripe",
                customer.stripeCustomerId ? (
                  <a
                    href={stripeDashboardCustomerUrl(customer.stripeCustomerId, stripe?.secretKey)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Stripe
                  </a>
                ) : integrations.stripe.connected ? (
                  "Not linked yet. Edit and save, or tap Sync with Stripe on the list."
                ) : (
                  <a href="/settings?tab=integrations#stripe">Connect Stripe</a>
                ),
              ],
            ]}
          />
        </Card>
      </div>

      {siteRows.length ? (
        <Card title={voice.customerFieldsTitle} note={voice.customerFieldsNote} className="mt-2">
          <KeyValue rows={siteRows} />
        </Card>
      ) : null}

      <div className="grid grid-2 mt-2">
        <Card
          title={voice.jobs}
          action={<a className="btn btn-secondary btn-sm" href={`/jobs/new?customerId=${customer.id}`}>Add</a>}
          flush={jobRows.length > 0}
        >
          {jobRows.length ? (
            <Rows>
              {jobRows.map((job) => (
                <RowLink
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  title={job.title}
                  meta={prettyWhen(job.scheduledStart) || "Not scheduled"}
                  badge={<Badge status={job.status} />}
                />
              ))}
            </Rows>
          ) : (
            <p className="muted">No {voice.jobs.toLowerCase()} yet.</p>
          )}
        </Card>

        <Card title="Invoices" action={<a className="btn btn-secondary btn-sm" href={`/invoices/new?customerId=${customer.id}`}>Add</a>} flush={invoiceRows.length > 0}>
          {invoiceRows.length ? (
            <Rows>
              {invoiceRows.map((inv) => (
                <RowLink
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  title={inv.number}
                  meta={`Due ${prettyDate(inv.dueDate)}`}
                  badge={<Badge status={inv.status} />}
                  amount={formatMoney(inv.totalCents)}
                />
              ))}
            </Rows>
          ) : (
            <p className="muted">No invoices yet.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-2 mt-2">
        <Card title="Payments" flush={paymentRows.length > 0}>
          {paymentRows.length ? (
            <Rows>
              {paymentRows.map((p) => (
                <RowLink
                  key={p.id}
                  href={`/payments/${p.id}`}
                  title={prettyDate(p.paidOn)}
                  meta={`${label(p.method)}${p.voidedAt ? " · voided" : ""}`}
                  amount={formatMoney(p.amountCents)}
                  dim={Boolean(p.voidedAt)}
                />
              ))}
            </Rows>
          ) : (
            <p className="muted">No payments yet.</p>
          )}
        </Card>

        <Card title="Notes">
          <form action={addNoteAction}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="field">
              <textarea name="body" placeholder={voice.notesPlaceholder} />
            </div>
            <button className="btn btn-secondary btn-sm mt-1" type="submit">Save note</button>
          </form>
          {customer.notes ? <p className="muted mt-2">{customer.notes}</p> : null}
          {noteRows.map((note) => (
            <div key={note.id} className="mt-2">
              <p>{note.body}</p>
              <p className="tiny">{prettyWhen(note.createdAt)}</p>
            </div>
          ))}
        </Card>
      </div>

      <form action={archiveCustomerAction} className="mt-2">
        <input type="hidden" name="id" value={customer.id} />
        <button className="btn btn-ghost btn-sm" type="submit">
          {customer.archivedAt ? `Restore this ${voice.customer.toLowerCase()}` : `Archive this ${voice.customer.toLowerCase()}`}
        </button>
      </form>
    </Shell>
  );
}

import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { addNoteAction, archiveCustomerAction } from "@/app/actions";
import {
  deleteCustomerContactAction,
  deletePropertyAction,
  saveCustomerContactAction,
  saveFollowUpAction,
  savePropertyAction,
} from "@/app/house-actions";
import { PayLinkActions } from "@/components/PayLinkActions";
import { Badge, Banner, Blank, Card, KeyValue, RowLink, Rows, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { loadCollectQueue } from "@/lib/collect-queue";
import { collectTotals, describeCollect } from "@/lib/collect";
import { buildCustomerTimeline, lastJobSummary } from "@/lib/customer-timeline";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { integrationStatus, stripeConfig } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { label, prettyDate, prettyWhen } from "@/lib/labels";
import { filledDetails, parseDetails, tradeFieldsFor } from "@/lib/business";
import { loadApp } from "@/lib/page";
import {
  customerHubUrl,
  invoicePayUrl,
  smsHref,
  telHref,
} from "@/lib/phone";
import {
  ensureCustomerPublicToken,
  ensureDefaultProperty,
  formatProperty,
  listContacts,
  listProperties,
  propertyLabel,
} from "@/lib/properties";
import { customerBalanceCents, customerLifetimeCents } from "@/lib/queries";
import { stripeDashboardCustomerUrl } from "@/lib/stripe-customers";
import { customers, estimates, invoices, jobs, notes, payments } from "@/lib/schema";
import { absoluteBaseUrl } from "@/lib/url";

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

  const [
    lifetime,
    balance,
    jobRows,
    estimateRows,
    invoiceRows,
    paymentRows,
    noteRows,
    integrations,
    stripe,
    collectRows,
    base,
  ] = await Promise.all([
    customerLifetimeCents(org.id, customer.id),
    customerBalanceCents(org.id, customer.id),
    db().select().from(jobs).where(and(eq(jobs.organizationId, org.id), eq(jobs.customerId, customer.id))),
    db().select().from(estimates).where(and(eq(estimates.organizationId, org.id), eq(estimates.customerId, customer.id))),
    db().select().from(invoices).where(and(eq(invoices.organizationId, org.id), eq(invoices.customerId, customer.id))),
    db().select().from(payments).where(and(eq(payments.organizationId, org.id), eq(payments.customerId, customer.id))),
    db()
      .select()
      .from(notes)
      .where(and(eq(notes.organizationId, org.id), eq(notes.customerId, customer.id)))
      .orderBy(desc(notes.createdAt)),
    integrationStatus(org.id),
    stripeConfig(org.id),
    loadCollectQueue(org.id, { customerId: customer.id }),
    absoluteBaseUrl(),
  ]);

  const [propertyRows, contactRows, publicToken] = await Promise.all([
    ensureDefaultProperty(org.id, customer).then(() => listProperties(org.id, customer.id)),
    listContacts(org.id, customer.id),
    ensureCustomerPublicToken(org.id, customer),
  ]);

  const billing = formatAddress(
    customer.billingLine1,
    customer.billingCity,
    customer.billingState,
    customer.billingPostal,
  );
  const service = formatAddress(
    customer.serviceLine1,
    customer.serviceCity,
    customer.serviceState,
    customer.servicePostal,
  );
  const siteRows = filledDetails(
    parseDetails(customer.details),
    tradeFieldsFor(org.businessType, "customer"),
  );
  const timeline = buildCustomerTimeline({
    jobs: jobRows,
    estimates: estimateRows,
    invoices: invoiceRows,
    payments: paymentRows,
    notes: noteRows,
  });
  const lastJob = lastJobSummary(jobRows);
  const unbilledCents = collectRows
    .filter((row) => row.kind === "unbilled")
    .reduce((sum, row) => sum + row.amountCents, 0);
  const collectMoney = collectTotals(collectRows);
  const call = telHref(customer.phone);
  const text = smsHref(customer.phone, `Hi ${customer.name}, this is ${org.name}.`);
  const hubUrl = customerHubUrl(base, publicToken);
  const openPay = collectRows.find((row) => row.kind === "open" && row.publicToken);

  return (
    <Shell
      {...shell}
      path="/customers"
      title={displayName(customer)}
      sub={
        <p className="page-sub">
          {voice.sinceLabel} {prettyDate(customer.customerSince)}
          {lastJob ? ` · Last job ${lastJob.title}` : ""}
          {customer.archivedAt ? " · Archived" : ""}
        </p>
      }
      actions={
        <>
          <a className="btn btn-secondary" href={`/customers/${customer.id}/edit`}>Edit</a>
          <a className="btn btn-secondary" href={`/estimates/new?customerId=${customer.id}`}>New estimate</a>
          <a className="btn btn-secondary" href={`/invoices/new?customerId=${customer.id}`}>New invoice</a>
          <a className="btn" href={`/jobs/new?customerId=${customer.id}`}>{voice.newJob}</a>
        </>
      }
    >
      <Banner error={q.error} ok={q.ok} />

      <Card>
        <div className="house-hero">
          <div>
            <span className="section-label">Before you knock</span>
            <strong>{service || billing || "No service address yet"}</strong>
            {customer.phone ? <div className="tiny">{customer.phone}</div> : null}
            {customer.email ? <div className="tiny">{customer.email}</div> : null}
          </div>
          <div className="house-hero-actions">
            {call ? (
              <a className="btn" href={call}>
                Call
              </a>
            ) : null}
            {text ? (
              <a className="btn btn-secondary" href={text}>
                Text
              </a>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-3">
        <Stat label="Paid to date" value={formatMoney(lifetime)} note="Payments received" tone="good" />
        <Stat
          label="Outstanding"
          value={formatMoney(balance)}
          note="Open invoice balances"
          tone={balance > 0 ? "bad" : undefined}
        />
        <Stat
          label="Unbilled"
          value={formatMoney(unbilledCents)}
          note="Finished work not invoiced"
          tone={unbilledCents > 0 ? "bad" : undefined}
        />
      </div>

      {collectRows.length ? (
        <Card
          title="Collect"
          note={describeCollect(collectMoney)}
          className="mt-2"
          action={<a className="btn btn-secondary btn-sm" href="/collect">Open Collect</a>}
        >
          {collectRows.map((row) => (
            <div key={`${row.kind}-${row.id}`} className="collect-item">
              <a className="rowlink" href={row.href}>
                {row.title}
              </a>
              <div className="tiny">
                {row.group}
                {row.amountCents ? ` · ${formatMoney(row.amountCents)}` : ""}
              </div>
            </div>
          ))}
          {openPay?.publicToken ? (
            <PayLinkActions
              phone={customer.phone}
              shopName={org.name}
              number={openPay.title}
              payUrl={invoicePayUrl(base, openPay.publicToken)}
            />
          ) : null}
        </Card>
      ) : null}

      {siteRows.length ? (
        <Card title={voice.customerFieldsTitle} note="Gate codes, dogs, equipment. Read this before the visit." className="mt-2">
          <KeyValue rows={siteRows} />
        </Card>
      ) : null}

      <Card title="Timeline" className="mt-2" flush={timeline.length > 0}>
        {timeline.length ? (
          <Rows>
            {timeline.map((item, index) =>
              item.href ? (
                <RowLink
                  key={`${item.kind}-${item.at}-${index}`}
                  href={item.href}
                  title={item.title}
                  meta={`${label(item.kind)} · ${label(item.meta)} · ${prettyWhen(item.at) || prettyDate(item.at.slice(0, 10))}`}
                  amount={item.amountCents ? formatMoney(item.amountCents) : undefined}
                  badge={item.status ? <Badge status={item.status} /> : undefined}
                />
              ) : (
                <li key={`${item.kind}-${item.at}-${index}`}>
                  <div className="row-item">
                    <span className="row-main">
                      <span className="row-title">{item.title}</span>
                      <span className="row-meta">
                        Note · {prettyWhen(item.at) || prettyDate(item.at.slice(0, 10))}
                      </span>
                    </span>
                  </div>
                </li>
              ),
            )}
          </Rows>
        ) : (
          <p className="muted">Nothing on the file yet.</p>
        )}
      </Card>

      <div className="grid grid-2 mt-2">
        <Card title="Houses">
          {propertyRows.map((property) => (
            <form key={property.id} action={savePropertyAction} className="collect-item">
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="id" value={property.id} />
              <div className="form-grid">
                <div className="field">
                  <label>Label</label>
                  <input name="label" defaultValue={property.label} />
                </div>
                <div className="field full">
                  <label>Street</label>
                  <input name="line1" defaultValue={property.line1} />
                </div>
                <div className="field">
                  <label>City</label>
                  <input name="city" defaultValue={property.city} />
                </div>
                <div className="field">
                  <label>State and ZIP</label>
                  <div className="field-pair">
                    <input name="state" defaultValue={property.state} />
                    <input name="postal" defaultValue={property.postal} />
                  </div>
                </div>
                <div className="field full">
                  <label>Gate, dogs, notes</label>
                  <input name="notes" defaultValue={property.notes} />
                </div>
              </div>
              <div className="row mt-1">
                <button className="btn btn-secondary btn-sm" type="submit">
                  Save {propertyLabel(property)}
                </button>
                {propertyRows.length > 1 ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    type="submit"
                    formAction={deletePropertyAction}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="tiny mt-1">{formatProperty(property) || "No street yet"}</p>
            </form>
          ))}
          <form action={savePropertyAction} className="mt-2">
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="form-grid">
              <div className="field">
                <label>Another house</label>
                <input name="label" placeholder="Rental, office, parents" />
              </div>
              <div className="field full">
                <label>Street</label>
                <input name="line1" />
              </div>
              <div className="field">
                <label>City</label>
                <input name="city" />
              </div>
              <div className="field">
                <label>State and ZIP</label>
                <div className="field-pair">
                  <input name="state" placeholder="FL" />
                  <input name="postal" />
                </div>
              </div>
              <div className="field full">
                <label>Notes</label>
                <input name="notes" />
              </div>
            </div>
            <button className="btn btn-secondary btn-sm mt-1" type="submit">
              Add house
            </button>
          </form>
        </Card>

        <Card title="People">
          <KeyValue
            rows={[
              [
                "Phone",
                customer.phone ? <a href={call || `tel:${customer.phone}`}>{customer.phone}</a> : <Blank />,
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
          {contactRows.map((contact) => (
            <form key={contact.id} action={deleteCustomerContactAction} className="collect-item">
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="id" value={contact.id} />
              <strong>{contact.name}</strong>
              <div className="tiny">
                {[contact.role, contact.phone, contact.email].filter(Boolean).join(" · ")}
              </div>
              <button className="btn btn-ghost btn-sm mt-1" type="submit">
                Remove
              </button>
            </form>
          ))}
          <form action={saveCustomerContactAction} className="mt-2">
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input name="name" required placeholder="Spouse, tenant, office" />
              </div>
              <div className="field">
                <label>Role</label>
                <input name="role" placeholder="Spouse" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input name="phone" />
              </div>
              <div className="field">
                <label>Email</label>
                <input name="email" type="email" />
              </div>
            </div>
            <button className="btn btn-secondary btn-sm mt-1" type="submit">
              Add person
            </button>
          </form>
        </Card>
      </div>

      <div className="grid grid-2 mt-2">
        <Card title="Follow up">
          <form action={saveFollowUpAction}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="form-grid">
              <div className="field">
                <label>Date</label>
                <input name="follow_up_on" type="date" defaultValue={customer.followUpOn || ""} />
              </div>
              <div className="field full">
                <label>Note</label>
                <input name="follow_up_note" defaultValue={customer.followUpNote || ""} />
              </div>
            </div>
            <button className="btn btn-secondary btn-sm mt-1" type="submit">
              Save follow-up
            </button>
          </form>
        </Card>
        <Card title="Customer hub" note="Open estimates and unpaid invoices. Not a booking site.">
          <div className="copy-row">
            <a className="copy-value" href={hubUrl} target="_blank" rel="noreferrer">
              {hubUrl}
            </a>
            <button className="btn btn-secondary btn-sm" type="button" data-copy={hubUrl}>
              Copy
            </button>
          </div>
        </Card>
      </div>

      <Card title="Notes" className="mt-2">
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

      <form action={archiveCustomerAction} className="mt-2">
        <input type="hidden" name="id" value={customer.id} />
        <button className="btn btn-ghost btn-sm" type="submit">
          {customer.archivedAt ? `Restore this ${voice.customer.toLowerCase()}` : `Archive this ${voice.customer.toLowerCase()}`}
        </button>
      </form>
    </Shell>
  );
}

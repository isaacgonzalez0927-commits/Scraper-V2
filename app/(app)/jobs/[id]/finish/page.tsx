import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { finishJobAction } from "@/app/actions";
import { PayLinkActions } from "@/components/PayLinkActions";
import { Banner, Card, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db, token } from "@/lib/db";
import { getChecklist, rows } from "@/lib/operations";
import { displayName, formatAddress } from "@/lib/display";
import { label } from "@/lib/labels";
import { centsToInput, formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { jobCostTotal } from "@/lib/queries";
import { customers, invoices, jobs } from "@/lib/schema";
import { invoicePayUrl, telHref } from "@/lib/phone";
import { absoluteBaseUrl } from "@/lib/url";

export default async function FinishJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; invoice?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { id } = await params;
  const q = await searchParams;
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, Number(id)), eq(jobs.organizationId, org.id)));
  if (!job) notFound();

  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, job.customerId), eq(customers.organizationId, org.id)));
  if (!customer) notFound();

  const [invoiceRows, costTotal, base] = await Promise.all([
    db()
      .select()
      .from(invoices)
      .where(and(eq(invoices.jobId, job.id), eq(invoices.organizationId, org.id))),
    jobCostTotal(org.id, job.id, job.estimatedCostCents),
    absoluteBaseUrl(),
  ]);
  const openInvoice = invoiceRows.find((invoice) => invoice.status !== "void");
  const checklist = await getChecklist(org.id,job.id);
  const incomplete = checklist.filter(item=>!item.done);
  const [approved]=await rows<{taxBps:number}>('SELECT tax_bps FROM estimates WHERE organization_id=? AND converted_job_id=? ORDER BY id LIMIT 1',[org.id,job.id]);
  const taxBps=openInvoice?.taxBps??approved?.taxBps??org.defaultTaxBps;
  const sentInvoice = invoiceRows.find((invoice) => invoice.id === Number(q.invoice || 0));
  const payUrl = sentInvoice ? invoicePayUrl(base, sentInvoice.publicToken) : "";
  const amount = openInvoice ? Math.max(0,openInvoice.subtotalCents-openInvoice.discountCents) : job.actualRevenueCents || job.estimatedRevenueCents;
  const address = formatAddress(
    job.serviceLine1,
    job.serviceCity,
    job.serviceState,
    job.servicePostal,
  );
  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";

  return (
    <Shell
      {...shell}
      path="/jobs"
      title={`Finish ${job.title}`}
      sub={
        <p className="page-sub">
          Close it at the truck. The office should not have to type this again.
        </p>
      }
      actions={
        <a className="btn btn-secondary" href={`/jobs/${job.id}`}>
          Back to {voice.job.toLowerCase()}
        </a>
      }
    >
      <Banner error={q.error} ok={q.ok} />
      {incomplete.length ? <Card title={`${incomplete.length} checklist items need attention`} note="Finish and sync these before closing the visit."><ul>{incomplete.map(item=><li key={item.id}>{item.label}</li>)}</ul><a className="btn btn-secondary" href={`/field?job=${job.id}`}>Open field checklist</a></Card> : null}
      {sentInvoice && payUrl ? (
        <Card
          title="Collect in the driveway"
          note="Text the pay link from this phone. Sere does not send the SMS for you."
        >
          <PayLinkActions
            phone={customer.phone}
            shopName={org.name}
            number={sentInvoice.number}
            payUrl={payUrl}
            invoiceId={sentInvoice.id}
            resend
          />
          <p className="help mt-1">
            <a href="/collect">See everything still sitting out</a>
          </p>
        </Card>
      ) : null}
      {openInvoice ? (
        <Banner
          info={
            openInvoice.status === "draft"
              ? `${openInvoice.number} is already linked. A changed final charge can update a single-line draft; edit itemized charges on the invoice.`
              : `${openInvoice.number} was already sent. Finishing will not change that invoice.`
          }
        />
      ) : null}
      {job.status === "completed" ? (
        <Banner info={`This ${voice.job.toLowerCase()} is already complete. You can still update the final record.`} />
      ) : null}

      <div className="closeout-contact">
        <div>
          <span className="section-label">{voice.customer}</span>
          <strong>{displayName(customer)}</strong>
          <span>{address || "No service address"}</span>
        </div>
        <div className="row">
          {customer.phone ? (
            <a className="btn btn-secondary btn-sm" href={telHref(customer.phone) || `tel:${customer.phone}`}>
              Call
            </a>
          ) : null}
          {mapsHref ? (
            <a className="btn btn-secondary btn-sm" href={mapsHref} target="_blank" rel="noreferrer">
              Directions
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid grid-3 mt-2">
        <Stat label="Quoted" value={formatMoney(job.estimatedRevenueCents)} />
        <Stat label="Costs so far" value={formatMoney(costTotal)} />
        <Stat
          label="Status"
          value={label(job.status)}
          note={job.technicianName ? `${voice.worker}: ${job.technicianName}` : undefined}
          small
        />
      </div>

      <form action={finishJobAction} className="grid narrow mt-2">
        <input type="hidden" name="job_id" value={job.id} />
        <input type="hidden" name="mutation_id" value={token()} />
        <input type="hidden" name="schedule_version" value={job.scheduleVersion} />
        <Card
          title="What happened"
          note="Your completion record stays alongside the original work scope."
        >
          <div className="field mt-1">
            <label>Work completed</label>
            <textarea
              name="work_completed"
              defaultValue={job.completionSummary || job.description}
              placeholder={voice.jobNotesPlaceholder}
              required
              autoFocus
            />
          </div>
        </Card>

        <Card
          title="Close the money"
          note={`This is the pre-tax charge after any discount. The invoice uses ${taxBps / 100}% tax${!openInvoice && approved ? ' from the approved estimate' : ''}.`}
        >
          <div className="form-grid mt-1">
            <div className="field">
              <label>Final charge before tax</label>
              <input
                name="final_amount"
                inputMode="decimal"
                defaultValue={centsToInput(amount)}
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label>Invoice line</label>
              <input value={job.title} readOnly />
            </div>
          </div>
        </Card>

        {job.status !== "completed" ? (
          <Card
            title="One last cost"
            note="Optional. Add the part or outside cost you bought during this visit."
          >
            <div className="form-grid mt-1">
              <div className="field">
                <label>Cost</label>
                <input name="extra_cost" inputMode="decimal" placeholder="0.00" />
              </div>
              <div className="field">
                <label>Category</label>
                <select name="cost_category" defaultValue={voice.costCategories[0]}>
                  {voice.costCategories.map((category) => (
                    <option key={category} value={category}>{label(category)}</option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label>What you bought</label>
                <input name="cost_description" placeholder={voice.costPlaceholder} />
              </div>
            </div>
          </Card>
        ) : null}

        <div className="closeout-actions">
          <button className="btn" type="submit" name="next" value="collect">
            Finish and collect
          </button>
          <button className="btn btn-secondary" type="submit" name="next" value="draft">
            Finish, bill later
          </button>
          <p>Collect sends the invoice now. Bill later puts a draft on Collect.</p>
          <details className="disclosure">
            <summary>No charge</summary>
            <div className="field mt-1">
              <label>Why this visit is no charge</label>
              <input name="no_charge_reason" placeholder="Warranty, neighbor, quote only" />
            </div>
            <button className="btn btn-ghost btn-sm mt-1" type="submit" name="next" value="nocharge">
              Finish with no charge
            </button>
          </details>
        </div>
      </form>
    </Shell>
  );
}

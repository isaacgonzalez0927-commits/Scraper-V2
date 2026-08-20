import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { finishJobAction } from "@/app/actions";
import { Banner, Card, KeyValue, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { label } from "@/lib/labels";
import { centsToInput, formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { jobCostTotal } from "@/lib/queries";
import { customers, invoices, jobs } from "@/lib/schema";

export default async function FinishJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
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

  const [invoiceRows, costTotal] = await Promise.all([
    db()
      .select()
      .from(invoices)
      .where(and(eq(invoices.jobId, job.id), eq(invoices.organizationId, org.id))),
    jobCostTotal(org.id, job.id, job.estimatedCostCents),
  ]);
  const openInvoice = invoiceRows.find((invoice) => invoice.status !== "void");
  const amount = job.actualRevenueCents || job.estimatedRevenueCents;
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
      <Banner error={q.error} />
      {openInvoice ? (
        <Banner
          info={
            openInvoice.status === "draft"
              ? `${openInvoice.number} is already linked. The final amount will update its single line.`
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
            <a className="btn btn-secondary btn-sm" href={`tel:${customer.phone}`}>
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
        <Card
          title="What happened"
          note="This replaces the original problem with the final record of the work."
        >
          <div className="field mt-1">
            <label>Work completed</label>
            <textarea
              name="work_completed"
              defaultValue={job.description}
              placeholder={voice.jobNotesPlaceholder}
              required
              autoFocus
            />
          </div>
        </Card>

        <Card
          title="Close the money"
          note={`The invoice uses this final amount. ${org.defaultTaxBps / 100}% tax is added when it is created.`}
        >
          <div className="form-grid mt-1">
            <div className="field">
              <label>Final amount to bill</label>
              <input
                name="final_amount"
                inputMode="decimal"
                defaultValue={centsToInput(amount)}
                placeholder="0.00"
                required
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
          <button className="btn" type="submit" name="next" value="invoice">
            {openInvoice ? `Finish & open ${openInvoice.number}` : "Finish & create invoice"}
          </button>
          <button className="btn btn-secondary" type="submit" name="next" value="job">
            Finish without invoice
          </button>
          <p>
            Creates a draft. You review it before the customer sees anything.
          </p>
        </div>
      </form>
    </Shell>
  );
}

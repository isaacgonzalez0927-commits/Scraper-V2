import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { addJobCostAction, addNoteAction, invoiceFromJobAction, updateJobStatusAction } from "@/app/actions";
import { Badge, Blank, Card, KeyValue, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName, formatAddress } from "@/lib/display";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { COST_CATEGORIES, JOB_STATUSES, label, prettyWhen } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { jobCostTotal, jobRevenueCents } from "@/lib/queries";
import { customers, invoices, jobCosts, jobs, notes } from "@/lib/schema";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, Number(id)), eq(jobs.organizationId, org.id)));
  if (!job) notFound();
  const [customer] = await db().select().from(customers).where(eq(customers.id, job.customerId));
  const [costs, invoiceRows, noteRows] = await Promise.all([
    db().select().from(jobCosts).where(and(eq(jobCosts.organizationId, org.id), eq(jobCosts.jobId, job.id))),
    db().select().from(invoices).where(and(eq(invoices.organizationId, org.id), eq(invoices.jobId, job.id))),
    db()
      .select()
      .from(notes)
      .where(and(eq(notes.organizationId, org.id), eq(notes.jobId, job.id)))
      .orderBy(desc(notes.createdAt)),
  ]);
  const costTotal = await jobCostTotal(org.id, job.id, job.estimatedCostCents);
  const revenue = jobRevenueCents(job);
  const invoiceCards = await Promise.all(
    invoiceRows.map(async (inv) => {
      const paid = await amountPaidCents(inv.id);
      return { inv, balance: balanceCents(inv.totalCents, paid, inv.status) };
    }),
  );
  const address = formatAddress(job.serviceLine1, job.serviceCity, job.serviceState, job.servicePostal);

  return (
    <Shell
      {...shell}
      path="/jobs"
      title={job.title}
      sub={
        <p className="page-sub">
          <a href={`/customers/${job.customerId}`}>{displayName(customer)}</a>
          {job.scheduledStart ? ` · ${prettyWhen(job.scheduledStart)}` : " · Not scheduled"}
        </p>
      }
      actions={
        <>
          <Badge status={job.status} />
          <a className="btn btn-secondary" href={`/jobs/${job.id}/edit`}>Edit</a>
          {job.status !== "completed" ? (
            <form action={updateJobStatusAction}>
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="status" value="completed" />
              <button className="btn btn-secondary" type="submit">Mark complete</button>
            </form>
          ) : null}
          <form action={invoiceFromJobAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button className="btn" type="submit">Create invoice</button>
          </form>
        </>
      }
    >
      <div className="grid grid-4">
        <Stat label="Revenue" value={formatMoney(revenue)} note="Actual if set, otherwise estimated" />
        <Stat label="Costs" value={formatMoney(costTotal)} note="Materials, labor, and equipment" />
        <Stat
          label="Profit"
          value={formatMoney(revenue - costTotal)}
          tone={revenue - costTotal >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Scheduled"
          value={prettyWhen(job.scheduledStart) || "Not scheduled"}
          small
          note={job.technicianName ? `Tech: ${job.technicianName}` : "No technician assigned"}
        />
      </div>

      <div className="grid grid-2 mt-2">
        <Card title="Job details">
          <p>{job.description || <span className="muted">No description yet.</span>}</p>
          <KeyValue
            rows={[
              ["Service address", address || <Blank text="Not set" />],
              ["Technician", job.technicianName || <Blank text="Unassigned" />],
              ["Status", label(job.status)],
            ]}
          />
          <form action={updateJobStatusAction} className="row mt-2">
            <input type="hidden" name="id" value={job.id} />
            <select className="input" name="status" defaultValue={job.status}>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" type="submit">Update status</button>
          </form>
          {job.notes ? <p className="muted mt-2">{job.notes}</p> : null}
        </Card>

        <Card title="Costs" note="Log parts and labor so the profit number means something.">
          {costs.length ? (
            <ul className="list">
              {costs.map((cost) => (
                <li key={cost.id}>
                  <div>
                    <span>{cost.description}</span>
                    <div className="tiny">{label(cost.category)}</div>
                  </div>
                  <span className="money">{formatMoney(cost.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No costs logged yet.</p>
          )}
          <form action={addJobCostAction} className="form-grid mt-2">
            <input type="hidden" name="job_id" value={job.id} />
            <div className="field">
              <label>Category</label>
              <select name="category">
                {COST_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Amount</label>
              <input name="amount" placeholder="96.00" inputMode="decimal" required />
            </div>
            <div className="field full">
              <label>Description</label>
              <input name="description" placeholder="Two technicians, 8 hours" />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary btn-sm" type="submit">Add cost</button>
            </div>
          </form>
        </Card>
      </div>

      <div className="grid grid-2 mt-2">
        <Card title="Invoices">
          {invoiceCards.length ? (
            <ul className="list">
              {invoiceCards.map(({ inv, balance }) => (
                <li key={inv.id}>
                  <div>
                    <a className="rowlink" href={`/invoices/${inv.id}`}>{inv.number}</a>
                    <div className="tiny">Balance {formatMoney(balance)}</div>
                  </div>
                  <div className="row">
                    <span className="money">{formatMoney(inv.totalCents)}</span>
                    <Badge status={inv.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No invoice yet. Finish the job, then create one.</p>
          )}
        </Card>

        <Card title="Notes">
          <form action={addNoteAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="customer_id" value={job.customerId} />
            <div className="field">
              <textarea name="body" placeholder="What did you find on site?" />
            </div>
            <button className="btn btn-secondary btn-sm mt-1" type="submit">Save note</button>
          </form>
          {noteRows.map((note) => (
            <div key={note.id} className="mt-2">
              <p>{note.body}</p>
              <p className="tiny">{prettyWhen(note.createdAt)}</p>
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}

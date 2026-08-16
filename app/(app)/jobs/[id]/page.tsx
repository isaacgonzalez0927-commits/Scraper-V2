import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { addJobCostAction, addNoteAction, invoiceFromJobAction, updateJobStatusAction } from "@/app/actions";
import { Badge } from "@/components/ui";
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

  return (
    <Shell
      {...shell}
      path="/jobs"
      title={job.title}
      sub={
        <p className="page-sub">
          <a href={`/customers/${job.customerId}`}>{displayName(customer)}</a>
          {" · "}
          <Badge status={job.status} />
        </p>
      }
      actions={
        <>
          <a className="btn btn-secondary" href={`/jobs/${job.id}/edit`}>Edit</a>
          {job.status !== "completed" ? (
            <form action={updateJobStatusAction}>
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="status" value="completed" />
              <button className="btn" type="submit">Mark complete</button>
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
        <article className="card"><p className="stat-label">Revenue</p><p className="stat-value money">{formatMoney(revenue)}</p></article>
        <article className="card"><p className="stat-label">Costs</p><p className="stat-value money">{formatMoney(costTotal)}</p></article>
        <article className="card"><p className="stat-label">Profit</p><p className="stat-value money">{formatMoney(revenue - costTotal)}</p></article>
        <article className="card"><p className="stat-label">When</p><p className="stat-value" style={{ fontSize: 20 }}>{prettyWhen(job.scheduledStart)}</p></article>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Job information</div>
          <p>{job.description || "No description yet."}</p>
          <p className="tiny">
            {formatAddress(job.serviceLine1, job.serviceCity, job.serviceState, job.servicePostal) || "No service address"}
          </p>
          <p className="tiny">Tech: {job.technicianName || "Unassigned"}</p>
          <form action={updateJobStatusAction} style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={job.id} />
            <select name="status" defaultValue={job.status}>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" type="submit">Update</button>
          </form>
        </section>
        <section className="card">
          <div className="card-title">Work performed & costs</div>
          {costs.length ? costs.map((cost) => (
            <div key={cost.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>{cost.description} <span className="tiny">{label(cost.category)}</span></span>
              <span className="money">{formatMoney(cost.amountCents)}</span>
            </div>
          )) : <p className="muted">No costs yet. Add materials or labor so profit is real.</p>}
          <form action={addJobCostAction} className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="job_id" value={job.id} />
            <div className="field">
              <label>Category</label>
              <select name="category">
                {COST_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="field"><label>Amount</label><input name="amount" placeholder="96.00" required /></div>
            <div className="field full"><label>Description</label><input name="description" placeholder="Two-man install, 8 hours" /></div>
            <div className="field full"><button className="btn btn-secondary btn-sm" type="submit">Add cost</button></div>
          </form>
        </section>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-title">Invoice</div>
          {invoiceCards.length ? invoiceCards.map(({ inv, balance }) => (
            <p key={inv.id}>
              <a href={`/invoices/${inv.id}`}>{inv.number}</a>{" "}
              <Badge status={inv.status} />{" "}
              <span className="money">{formatMoney(inv.totalCents)}</span>{" "}
              <span className="tiny">Balance {formatMoney(balance)}</span>
            </p>
          )) : <p className="muted">No invoice yet. Complete the job, then create one.</p>}
        </section>
        <section className="card">
          <div className="card-title">Notes</div>
          <form action={addNoteAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="customer_id" value={job.customerId} />
            <div className="field"><textarea name="body" placeholder="What did you find on site?" /></div>
            <button className="btn btn-secondary btn-sm" type="submit">Save note</button>
          </form>
          {noteRows.map((note) => (
            <p key={note.id}>{note.body}<br /><span className="tiny">{prettyWhen(note.createdAt)}</span></p>
          ))}
        </section>
      </div>
    </Shell>
  );
}

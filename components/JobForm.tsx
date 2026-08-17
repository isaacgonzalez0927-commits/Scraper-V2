import { saveJobAction } from "@/app/actions";
import { Banner } from "@/components/ui";
import { toLocalInput } from "@/lib/display";
import { JOB_STATUSES, label } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { customers, jobs } from "@/lib/schema";

type Customer = typeof customers.$inferSelect;
type Job = typeof jobs.$inferSelect;

export function JobForm({
  job,
  customerRows,
  error,
}: {
  job?: Partial<Job>;
  customerRows: Customer[];
  error?: string;
}) {
  return (
    <form action={saveJobAction} className="grid narrow">
      {job?.id ? <input type="hidden" name="id" value={job.id} /> : null}
      <Banner error={error} />

      <section className="card form-grid">
        <div className="field">
          <label>Customer</label>
          <select name="customer_id" required defaultValue={job?.customerId || ""}>
            <option value="">Choose a customer</option>
            {customerRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName && c.companyName !== c.name ? `${c.name} · ${c.companyName}` : c.companyName || c.name}
              </option>
            ))}
          </select>
          <p className="help"><a href="/customers/new">Add a new customer</a></p>
        </div>
        <div className="field">
          <label>Job title</label>
          <input name="title" defaultValue={job?.title || ""} required placeholder="AC replacement" />
        </div>
        <div className="field full">
          <label>Work to perform</label>
          <textarea name="description" defaultValue={job?.description || ""} />
        </div>
        <div className="field">
          <label>Status</label>
          <select name="status" defaultValue={job?.status || "unscheduled"}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Start</label>
          <input name="scheduled_start" type="datetime-local" defaultValue={toLocalInput(job?.scheduledStart)} />
          <p className="help">Setting a start time schedules the job automatically.</p>
        </div>
        <div className="field">
          <label>Technician</label>
          <input name="technician_name" defaultValue={job?.technicianName || ""} />
        </div>
        <div className="field">
          <label>Notes</label>
          <input name="notes" defaultValue={job?.notes || ""} />
        </div>
      </section>

      <section className="card form-grid">
        <div className="field full">
          <h2 className="card-title">Service address</h2>
        </div>
        <div className="field full">
          <label>Street</label>
          <input name="service_line1" defaultValue={job?.serviceLine1 || ""} />
        </div>
        <div className="field">
          <label>City</label>
          <input name="service_city" defaultValue={job?.serviceCity || ""} />
        </div>
        <div className="field">
          <label>State and ZIP</label>
          <div className="field-pair">
            <input name="service_state" defaultValue={job?.serviceState || ""} />
            <input name="service_postal" defaultValue={job?.servicePostal || ""} />
          </div>
        </div>
      </section>

      <section className="card form-grid">
        <div className="field full">
          <h2 className="card-title">Money</h2>
          <p className="card-note">Estimated revenue is the quote. Actual revenue is what you billed.</p>
        </div>
        <div className="field">
          <label>Estimated revenue</label>
          <input name="estimated_revenue" inputMode="decimal" defaultValue={centsToInput(job?.estimatedRevenueCents || 0)} />
        </div>
        <div className="field">
          <label>Actual revenue</label>
          <input name="actual_revenue" inputMode="decimal" defaultValue={centsToInput(job?.actualRevenueCents || 0)} />
        </div>
        <div className="field">
          <label>Estimated cost</label>
          <input name="estimated_cost" inputMode="decimal" defaultValue={centsToInput(job?.estimatedCostCents || 0)} />
          <p className="help">Logged costs on the job page replace this estimate.</p>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Save job</button>
        </div>
      </section>
    </form>
  );
}

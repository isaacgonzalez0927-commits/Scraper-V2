import { saveJobAction } from "@/app/actions";
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
    <form action={saveJobAction} className="card form-grid">
      {job?.id ? <input type="hidden" name="id" value={job.id} /> : null}
      {error ? <div className="flash flash-error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
      <div className="field">
        <label>Customer</label>
        <select name="customer_id" required defaultValue={job?.customerId || ""}>
          <option value="">Choose…</option>
          {customerRows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName && c.companyName !== c.name ? `${c.name} · ${c.companyName}` : c.companyName || c.name}
            </option>
          ))}
        </select>
        <p className="help"><a href="/customers/new">Need a new customer?</a></p>
      </div>
      <div className="field">
        <label>Title</label>
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
        <label>Technician</label>
        <input name="technician_name" defaultValue={job?.technicianName || ""} />
      </div>
      <div className="field">
        <label>Start</label>
        <input name="scheduled_start" type="datetime-local" defaultValue={toLocalInput(job?.scheduledStart)} />
      </div>
      <div className="field full">
        <label>Service address</label>
        <input name="service_line1" defaultValue={job?.serviceLine1 || ""} />
      </div>
      <div className="field">
        <label>City</label>
        <input name="service_city" defaultValue={job?.serviceCity || ""} />
      </div>
      <div className="field">
        <label>State / ZIP</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input name="service_state" defaultValue={job?.serviceState || ""} />
          <input name="service_postal" defaultValue={job?.servicePostal || ""} />
        </div>
      </div>
      <div className="field">
        <label>Estimated revenue</label>
        <input name="estimated_revenue" defaultValue={centsToInput(job?.estimatedRevenueCents || 0)} />
      </div>
      <div className="field">
        <label>Actual revenue</label>
        <input name="actual_revenue" defaultValue={centsToInput(job?.actualRevenueCents || 0)} />
      </div>
      <div className="field">
        <label>Estimated cost</label>
        <input name="estimated_cost" defaultValue={centsToInput(job?.estimatedCostCents || 0)} />
      </div>
      <div className="field full">
        <label>Notes</label>
        <textarea name="notes" defaultValue={job?.notes || ""} />
      </div>
      <div className="field full">
        <button className="btn" type="submit">Save job</button>
      </div>
    </form>
  );
}

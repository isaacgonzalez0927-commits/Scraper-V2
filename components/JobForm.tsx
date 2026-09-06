import { saveJobAction } from "@/app/actions";
import { TradeFields } from "@/components/TradeFields";
import { Banner } from "@/components/ui";
import { parseDetails, type TradeField, type TradeProfile } from "@/lib/business";
import { toLocalInput } from "@/lib/display";
import { JOB_STATUSES, label } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import { propertyLabel } from "@/lib/properties";
import type { customers, jobs, properties } from "@/lib/schema";
import type { CrewMember } from "@/lib/operations";

type Customer = typeof customers.$inferSelect;
type Job = typeof jobs.$inferSelect;
type Property = typeof properties.$inferSelect;

export function JobForm({
  job,
  customerRows,
  propertyRows = [],
  error,
  voice,
  fields,
  crewRows = [],
}: {
  job?: Partial<Job>;
  customerRows: Customer[];
  propertyRows?: Property[];
  error?: string;
  voice: TradeProfile;
  fields: readonly TradeField[];
  crewRows?: CrewMember[];
}) {
  const details = parseDetails(job?.details);
  return (
    <form action={saveJobAction} className="grid narrow">
      {job?.id ? <input type="hidden" name="id" value={job.id} /> : null}
      {job?.id ? <input type="hidden" name="schedule_version" value={job.scheduleVersion || 0} /> : null}
      <Banner error={error} />

      <section className="card form-grid">
        <div className="field">
          <label>{voice.customer}</label>
          <select name="customer_id" required defaultValue={job?.customerId || ""}>
            <option value="">Choose a {voice.customer.toLowerCase()}</option>
            {customerRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName && c.companyName !== c.name ? `${c.name} · ${c.companyName}` : c.companyName || c.name}
              </option>
            ))}
          </select>
          <p className="help"><a href="/customers/new">Add a new {voice.customer.toLowerCase()}</a></p>
        </div>
        {propertyRows.length ? (
          <div className="field">
            <label>House</label>
            <select name="property_id" defaultValue={job?.propertyId || ""}>
              <option value="">Use the address below</option>
              {propertyRows.map((property) => (
                <option key={property.id} value={property.id}>
                  {propertyLabel(property)}
                </option>
              ))}
            </select>
            <p className="help">Picking a house copies its address onto this {voice.job.toLowerCase()}.</p>
          </div>
        ) : null}
        <div className="field">
          <label>{voice.jobTitleLabel}</label>
          <input name="title" defaultValue={job?.title || ""} required placeholder={voice.jobPlaceholder} />
        </div>
        <div className="field full">
          <label>{voice.workLabel}</label>
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
          <p className="help">Setting a start time schedules the {voice.job.toLowerCase()} automatically.</p>
        </div>
        <div className="field">
          <label>{voice.worker}</label>
          {crewRows.length ? <select name="team_member_id" defaultValue={job?.teamMemberId||""}><option value="">Unassigned</option>{crewRows.filter(m=>m.active||m.id===job?.teamMemberId).map(m=><option key={m.id} value={m.id}>{m.name}{m.active?'':' · inactive'}</option>)}</select>:<input name="technician_name" defaultValue={job?.technicianName || ""} />}
        </div>
        <div className="field"><label>Duration</label><select name="duration_minutes" defaultValue={job?.durationMinutes||60}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1½ hours</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option><option value="480">Full day</option></select></div>
        <div className="field"><label>Priority</label><select name="priority" defaultValue={job?.priority||"normal"}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
        <div className="field">
          <label>Notes</label>
          <input
            name="notes"
            defaultValue={job?.notes || ""}
            placeholder={voice.jobNotesPlaceholder}
          />
        </div>
      </section>

      <TradeFields
        fields={fields}
        values={details}
        title={voice.jobFieldsTitle}
        note={voice.jobFieldsNote}
      />

      <section className="card form-grid">
        <div className="field full">
          <h2 className="card-title">{voice.siteLabel}</h2>
          <p className="card-note">{voice.siteNote}</p>
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
          <p className="help">Logged costs on the {voice.job.toLowerCase()} page replace this estimate.</p>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Save {voice.job.toLowerCase()}</button>
        </div>
      </section>
    </form>
  );
}

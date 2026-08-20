import { saveCustomerAction } from "@/app/actions";
import { TradeFields } from "@/components/TradeFields";
import { Banner } from "@/components/ui";
import { parseDetails, type TradeField, type TradeProfile } from "@/lib/business";
import type { customers } from "@/lib/schema";

type Customer = typeof customers.$inferSelect;

export function CustomerForm({
  customer,
  error,
  voice,
  fields,
}: {
  customer?: Partial<Customer>;
  error?: string;
  voice: TradeProfile;
  fields: readonly TradeField[];
}) {
  const details = parseDetails(customer?.details);
  return (
    <form action={saveCustomerAction} className="grid narrow">
      {customer?.id ? <input type="hidden" name="id" value={customer.id} /> : null}
      <Banner error={error} />

      <section className="card form-grid">
        <div className="field">
          <label>Name</label>
          <input name="name" defaultValue={customer?.name || ""} required />
        </div>
        <div className="field">
          <label>{voice.companyLabel}</label>
          <input name="company_name" defaultValue={customer?.companyName || ""} />
        </div>
        <div className="field">
          <label>Email</label>
          <input name="email" type="email" defaultValue={customer?.email || ""} />
        </div>
        <div className="field">
          <label>Phone</label>
          <input name="phone" defaultValue={customer?.phone || ""} />
        </div>
        <div className="field">
          <label>{voice.sinceLabel}</label>
          <input name="customer_since" type="date" defaultValue={customer?.customerSince || ""} />
        </div>
        <div className="field full">
          <label>Notes</label>
          <textarea
            name="notes"
            defaultValue={customer?.notes || ""}
            placeholder={voice.notesPlaceholder}
          />
        </div>
      </section>

      <TradeFields
        fields={fields}
        values={details}
        title={voice.customerFieldsTitle}
        note={voice.customerFieldsNote}
      />

      <section className="card form-grid">
        <div className="field full">
          <h2 className="card-title">Billing address</h2>
        </div>
        <div className="field full">
          <label>Street</label>
          <input name="billing_line1" defaultValue={customer?.billingLine1 || ""} />
        </div>
        <div className="field">
          <label>City</label>
          <input name="billing_city" defaultValue={customer?.billingCity || ""} />
        </div>
        <div className="field">
          <label>State and ZIP</label>
          <div className="field-pair">
            <input name="billing_state" defaultValue={customer?.billingState || ""} placeholder="FL" />
            <input name="billing_postal" defaultValue={customer?.billingPostal || ""} placeholder="33901" />
          </div>
        </div>
        <div className="field full">
          <label className="checkbox">
            <input type="checkbox" name="same_as_billing" value="1" defaultChecked />
            The {voice.siteLabel.toLowerCase()} is the same as billing
          </label>
        </div>
      </section>

      <section className="card form-grid">
        <div className="field full">
          <h2 className="card-title">{voice.siteLabel}</h2>
          <p className="card-note">{voice.siteNote}</p>
        </div>
        <div className="field full">
          <label>Street</label>
          <input name="service_line1" defaultValue={customer?.serviceLine1 || ""} />
        </div>
        <div className="field">
          <label>City</label>
          <input name="service_city" defaultValue={customer?.serviceCity || ""} />
        </div>
        <div className="field">
          <label>State and ZIP</label>
          <div className="field-pair">
            <input name="service_state" defaultValue={customer?.serviceState || ""} />
            <input name="service_postal" defaultValue={customer?.servicePostal || ""} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Save {voice.customer.toLowerCase()}</button>
          {!customer?.id ? (
            <button className="btn btn-secondary" type="submit" name="next" value="job">
              Save and create a {voice.job.toLowerCase()}
            </button>
          ) : null}
        </div>
      </section>
    </form>
  );
}

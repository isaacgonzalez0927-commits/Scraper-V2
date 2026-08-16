import { saveCustomerAction } from "@/app/actions";
import type { customers } from "@/lib/schema";

type Customer = typeof customers.$inferSelect;

export function CustomerForm({
  customer,
  error,
}: {
  customer?: Partial<Customer>;
  error?: string;
}) {
  return (
    <form action={saveCustomerAction} className="card form-grid">
      {customer?.id ? <input type="hidden" name="id" value={customer.id} /> : null}
      {error ? <div className="flash flash-error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
      <div className="field">
        <label>Name</label>
        <input name="name" defaultValue={customer?.name || ""} required />
      </div>
      <div className="field">
        <label>Company</label>
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
        <label>Customer since</label>
        <input name="customer_since" type="date" defaultValue={customer?.customerSince || ""} />
      </div>
      <div className="field full">
        <label>Notes</label>
        <textarea name="notes" defaultValue={customer?.notes || ""} />
      </div>
      <div className="field full"><strong>Billing address</strong></div>
      <div className="field full">
        <label>Street</label>
        <input name="billing_line1" defaultValue={customer?.billingLine1 || ""} />
      </div>
      <div className="field">
        <label>City</label>
        <input name="billing_city" defaultValue={customer?.billingCity || ""} />
      </div>
      <div className="field">
        <label>State / ZIP</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input name="billing_state" defaultValue={customer?.billingState || ""} placeholder="FL" />
          <input name="billing_postal" defaultValue={customer?.billingPostal || ""} placeholder="33901" />
        </div>
      </div>
      <div className="field full">
        <label>
          <input type="checkbox" name="same_as_billing" value="1" defaultChecked /> Service address is the same
        </label>
      </div>
      <div className="field full"><strong>Service address</strong></div>
      <div className="field full">
        <label>Street</label>
        <input name="service_line1" defaultValue={customer?.serviceLine1 || ""} />
      </div>
      <div className="field">
        <label>City</label>
        <input name="service_city" defaultValue={customer?.serviceCity || ""} />
      </div>
      <div className="field">
        <label>State / ZIP</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input name="service_state" defaultValue={customer?.serviceState || ""} />
          <input name="service_postal" defaultValue={customer?.servicePostal || ""} />
        </div>
      </div>
      <div className="field full" style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="submit">Save customer</button>
        {!customer?.id ? (
          <button className="btn btn-secondary" type="submit" name="next" value="job">
            Save and create job
          </button>
        ) : null}
      </div>
    </form>
  );
}

import { saveEstimateAction } from "@/app/actions";
import { Banner } from "@/components/ui";
import { addDaysISO, todayISO } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { customers, estimateLines, estimates, serviceItems } from "@/lib/schema";

type Customer = typeof customers.$inferSelect;
type Estimate = typeof estimates.$inferSelect;
type Line = typeof estimateLines.$inferSelect;
type Service = typeof serviceItems.$inferSelect;

export function EstimateForm({
  estimate,
  lines,
  customerRows,
  services,
  error,
  defaultCustomerId,
  defaultTaxBps,
}: {
  estimate?: Partial<Estimate>;
  lines?: Line[];
  customerRows: Customer[];
  services: Service[];
  error?: string;
  defaultCustomerId?: number;
  defaultTaxBps: number;
}) {
  const issue = estimate?.issueDate || todayISO();
  const validUntil = estimate?.validUntil || addDaysISO(issue, 30);
  const existing = lines?.length ? lines : [{ description: "", quantity: "1", unitPriceCents: 0 }];

  return (
    <form action={saveEstimateAction} className="grid">
      {estimate?.id ? <input type="hidden" name="id" value={estimate.id} /> : null}
      <Banner error={error} />

      <section className="card form-grid">
        <div className="field">
          <label>Customer</label>
          <select name="customer_id" required defaultValue={estimate?.customerId || defaultCustomerId || ""}>
            <option value="">Choose a customer</option>
            {customerRows.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName && customer.companyName !== customer.name
                  ? `${customer.name} · ${customer.companyName}`
                  : customer.companyName || customer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Issue date</label>
          <input type="date" name="issue_date" defaultValue={issue} required />
        </div>
        <div className="field">
          <label>Valid until</label>
          <input type="date" name="valid_until" defaultValue={validUntil} required />
        </div>
        <div className="field">
          <label>Tax rate %</label>
          <input name="tax_rate" inputMode="decimal" defaultValue={((estimate?.taxBps ?? defaultTaxBps) / 100).toFixed(2)} />
        </div>
        <div className="field">
          <label>Discount</label>
          <input name="discount" inputMode="decimal" defaultValue={centsToInput(estimate?.discountCents || 0)} />
        </div>
        <div className="field full">
          <label>Notes shown to the customer</label>
          <textarea name="notes" defaultValue={estimate?.notes || ""} />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Line items</h2>
            <p className="card-note">Quantity times price, per line.</p>
          </div>
          <div className="row">
            <select className="input" id="service-catalog" aria-label="Add a saved service">
              <option value="">Add a saved service</option>
              {services.map((service) => (
                <option
                  key={service.id}
                  value={service.id}
                  data-name={service.name}
                  data-price={centsToInput(service.unitPriceCents)}
                >
                  {service.name} at {(service.unitPriceCents / 100).toFixed(2)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" id="add-line">Add line</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data table-inline">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th />
              </tr>
            </thead>
            <tbody id="line-body">
              {existing.map((line, index) => (
                <tr key={index}>
                  <td>
                    <input
                      name="line_description"
                      defaultValue={"description" in line ? line.description : ""}
                      required
                      placeholder="Diagnostic visit"
                    />
                  </td>
                  <td><input name="line_quantity" inputMode="decimal" defaultValue={"quantity" in line ? line.quantity : "1"} /></td>
                  <td>
                    <input
                      name="line_price"
                      inputMode="decimal"
                      defaultValue={centsToInput("unitPriceCents" in line ? line.unitPriceCents : 0)}
                    />
                  </td>
                  <td className="right">
                    <button type="button" className="btn btn-ghost btn-sm" data-remove-line>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-actions mt-2">
          <button className="btn" type="submit">Save estimate</button>
          <p className="help">Totals and tax are recalculated on save. Estimates do not collect payment.</p>
        </div>
      </section>
    </form>
  );
}

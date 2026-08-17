import { saveInvoiceAction } from "@/app/actions";
import { Banner } from "@/components/ui";
import { addDaysISO, todayISO } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { customers, invoiceLines, invoices, jobs, serviceItems } from "@/lib/schema";

type Customer = typeof customers.$inferSelect;
type Job = typeof jobs.$inferSelect;
type Invoice = typeof invoices.$inferSelect;
type Line = typeof invoiceLines.$inferSelect;
type Service = typeof serviceItems.$inferSelect;

export function InvoiceForm({
  invoice,
  lines,
  customerRows,
  jobRows,
  services,
  error,
  defaultCustomerId,
  defaultJobId,
  defaultTaxBps,
  defaultNotes,
  termsDays,
}: {
  invoice?: Partial<Invoice>;
  lines?: Line[];
  customerRows: Customer[];
  jobRows: Job[];
  services: Service[];
  error?: string;
  defaultCustomerId?: number;
  defaultJobId?: number;
  defaultTaxBps: number;
  defaultNotes: string;
  termsDays: number;
}) {
  const issue = invoice?.issueDate || todayISO();
  const due = invoice?.dueDate || addDaysISO(issue, termsDays);
  const existing = lines?.length ? lines : [{ description: "", quantity: "1", unitPriceCents: 0 }];

  return (
    <form action={saveInvoiceAction} className="grid">
      {invoice?.id ? <input type="hidden" name="id" value={invoice.id} /> : null}
      <Banner error={error} />

      <section className="card form-grid">
        <div className="field">
          <label>Customer</label>
          <select name="customer_id" id="customer_id" required defaultValue={invoice?.customerId || defaultCustomerId || ""}>
            <option value="">Choose a customer</option>
            {customerRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName && c.companyName !== c.name ? `${c.name} · ${c.companyName}` : c.companyName || c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Related job</label>
          <select name="job_id" id="job_id" defaultValue={invoice?.jobId || defaultJobId || ""}>
            <option value="">No related job</option>
            {jobRows.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Issue date</label>
          <input type="date" name="issue_date" defaultValue={issue} />
        </div>
        <div className="field">
          <label>Due date</label>
          <input type="date" name="due_date" defaultValue={due} />
        </div>
        <div className="field">
          <label>Tax rate %</label>
          <input name="tax_rate" inputMode="decimal" defaultValue={((invoice?.taxBps ?? defaultTaxBps) / 100).toFixed(2)} />
        </div>
        <div className="field">
          <label>Discount</label>
          <input name="discount" inputMode="decimal" defaultValue={centsToInput(invoice?.discountCents || 0)} />
        </div>
        <div className="field full">
          <label>Notes shown to the customer</label>
          <textarea name="notes" defaultValue={invoice?.notes || defaultNotes} />
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
              {services.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  data-name={s.name}
                  data-price={centsToInput(s.unitPriceCents)}
                >
                  {s.name} at {(s.unitPriceCents / 100).toFixed(2)}
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
              {existing.map((line, i) => (
                <tr key={i}>
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
          <button className="btn" type="submit">Save invoice</button>
          <p className="help">
            Totals and tax are recalculated on save. A partial payment never marks an invoice paid.
          </p>
        </div>
      </section>
    </form>
  );
}

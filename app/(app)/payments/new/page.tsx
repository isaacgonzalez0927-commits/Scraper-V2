import { and, eq, isNull, ne } from "drizzle-orm";
import { recordPaymentAction } from "@/app/actions";
import { Banner } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { PAYMENT_METHODS, label, todayISO } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { customers, invoices } from "@/lib/schema";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string; customerId?: string; error?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const customerRows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)));
  const invoiceRows = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, org.id), ne(invoices.status, "void")));
  const open = await Promise.all(
    invoiceRows.map(async (invoice) => {
      const paid = await amountPaidCents(invoice.id);
      return { invoice, balance: balanceCents(invoice.totalCents, paid, invoice.status) };
    }),
  );
  const selected = q.invoiceId ? open.find((r) => r.invoice.id === Number(q.invoiceId)) : undefined;

  return (
    <Shell
      {...shell}
      path="/payments"
      title="Record payment"
      sub={<p className="page-sub">For money you took in person. Online card payments post themselves.</p>}
      actions={<a className="btn btn-secondary" href="/payments">Cancel</a>}
    >
      <Banner error={q.error} />
      <form action={recordPaymentAction} className="card form-grid">
        <div className="field">
          <label>Customer</label>
          <select name="customer_id" defaultValue={selected?.invoice.customerId || q.customerId || ""} required>
            <option value="">Choose a customer</option>
            {customerRows.map((c) => (
              <option key={c.id} value={c.id}>{displayName(c)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Invoice</label>
          <select name="invoice_id" defaultValue={q.invoiceId || ""}>
            <option value="">Not tied to an invoice</option>
            {open.filter((r) => r.balance > 0 || r.invoice.status === "draft").map(({ invoice, balance }) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.number}, {formatMoney(balance)} remaining
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount</label>
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={selected ? (selected.balance / 100).toFixed(2) : ""}
            placeholder="100.00"
          />
        </div>
        <div className="field">
          <label>Paid on</label>
          <input type="date" name="paid_on" defaultValue={todayISO()} />
        </div>
        <div className="field">
          <label>Method</label>
          <select name="method" defaultValue="card">
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{label(m)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Reference</label>
          <input name="reference" placeholder="Check number or last 4 digits" />
        </div>
        <div className="field full">
          <label>Notes</label>
          <textarea name="notes" />
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Record payment</button>
          <p className="help">
            A payment larger than the remaining balance is rejected. Paid means the balance is $0.00.
          </p>
        </div>
      </form>
    </Shell>
  );
}

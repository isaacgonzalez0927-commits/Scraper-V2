import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { voidPaymentAction } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { label, prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { customers, invoices, payments } from "@/lib/schema";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, shell } = await loadApp();
  const { id } = await params;
  const [payment] = await db()
    .select()
    .from(payments)
    .where(and(eq(payments.id, Number(id)), eq(payments.organizationId, org.id)));
  if (!payment) notFound();
  const [customer] = await db().select().from(customers).where(eq(customers.id, payment.customerId));
  const invoice = payment.invoiceId
    ? (await db().select().from(invoices).where(eq(invoices.id, payment.invoiceId)))[0]
    : null;

  return (
    <Shell {...shell} path="/payments" title={formatMoney(payment.amountCents)}>
      <section className="card">
        <p>Received {prettyDate(payment.paidOn)} via {label(payment.method)}</p>
        <p>Customer: <a href={`/customers/${customer.id}`}>{displayName(customer)}</a></p>
        <p>
          Invoice:{" "}
          {invoice ? <a href={`/invoices/${invoice.id}`}>{invoice.number}</a> : "Unapplied"}
        </p>
        {payment.reference ? <p>Reference: {payment.reference}</p> : null}
        {payment.notes ? <p>{payment.notes}</p> : null}
        {payment.voidedAt ? (
          <p className="muted">Voided {prettyDate(payment.voidedAt)}</p>
        ) : (
          <form action={voidPaymentAction} style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={payment.id} />
            <button className="btn btn-ghost btn-sm" type="submit">Void payment</button>
          </form>
        )}
      </section>
    </Shell>
  );
}

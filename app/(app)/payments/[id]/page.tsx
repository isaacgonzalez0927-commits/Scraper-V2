import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { voidPaymentAction } from "@/app/actions";
import { Blank, Card, KeyValue } from "@/components/ui";
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
    <Shell
      {...shell}
      path="/payments"
      title={formatMoney(payment.amountCents)}
      sub={
        <p className="page-sub">
          {label(payment.method)} payment received {prettyDate(payment.paidOn)}
          {payment.voidedAt ? ` · voided ${prettyDate(payment.voidedAt)}` : ""}
        </p>
      }
      actions={<a className="btn btn-secondary" href="/payments">All payments</a>}
    >
      <div className="grid grid-2">
        <Card title="Details">
          <KeyValue
            rows={[
              ["Customer", <a href={`/customers/${customer.id}`}>{displayName(customer)}</a>],
              ["Invoice", invoice ? <a href={`/invoices/${invoice.id}`}>{invoice.number}</a> : <Blank text="Not applied" />],
              ["Method", label(payment.method)],
              ["Reference", payment.reference || <Blank text="None" />],
              ["Amount", formatMoney(payment.amountCents)],
            ]}
          />
          {payment.notes ? <p className="muted mt-2">{payment.notes}</p> : null}
        </Card>

        <Card title="Correcting a payment" note="Sere never edits money. It voids and you record it again.">
          {payment.voidedAt ? (
            <p className="muted">
              This payment was voided on {prettyDate(payment.voidedAt)}. It no longer counts toward any
              invoice balance or report.
            </p>
          ) : (
            <form action={voidPaymentAction}>
              <input type="hidden" name="id" value={payment.id} />
              <p className="muted">
                Voiding puts the amount back on the invoice balance and removes it from reports.
              </p>
              <button className="btn btn-secondary btn-sm mt-1" type="submit">Void this payment</button>
            </form>
          )}
        </Card>
      </div>
    </Shell>
  );
}

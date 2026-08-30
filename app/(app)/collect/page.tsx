import {
  billFinishedJobAction,
  convertEstimateToJobAction,
  sendCollectInvoiceAction,
} from "@/app/actions";
import { PayLinkActions } from "@/components/PayLinkActions";
import { Banner, Card, Empty, Stat } from "@/components/ui";
import { Shell } from "@/components/Shell";
import {
  collectTotals,
  describeCollect,
  groupCollectRows,
} from "@/lib/collect";
import { loadCollectQueue } from "@/lib/collect-queue";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { invoicePayUrl } from "@/lib/phone";
import { absoluteBaseUrl } from "@/lib/url";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { invoices } from "@/lib/schema";

export default async function CollectPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; invoice?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const [queue, base] = await Promise.all([
    loadCollectQueue(org.id),
    absoluteBaseUrl(),
  ]);
  const totals = collectTotals(queue);
  const groups = groupCollectRows(queue);
  const invoiceId = Number(q.invoice || 0);
  const [sentInvoice] = invoiceId
    ? await db()
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org.id)))
    : [];
  const payUrl = sentInvoice ? invoicePayUrl(base, sentInvoice.publicToken) : "";
  const sentCustomer = sentInvoice
    ? queue.find((row) => row.kind !== "unbilled" && row.id === sentInvoice.id) ||
      queue.find((row) => row.customerId === sentInvoice.customerId)
    : null;

  return (
    <Shell
      {...shell}
      path="/collect"
      title="Collect"
      sub={<p className="page-sub">{describeCollect(totals)}</p>}
    >
      <Banner error={q.error} ok={q.ok} />
      {sentInvoice && payUrl ? (
        <Card
          title={`${sentInvoice.number} is ready to collect`}
          note="Text it from this phone. Sere does not send the SMS for you."
        >
          <PayLinkActions
            phone={sentCustomer?.phone || ""}
            shopName={org.name}
            number={sentInvoice.number}
            payUrl={payUrl}
            invoiceId={sentInvoice.id}
            resend
          />
        </Card>
      ) : null}

      <div className="grid grid-3 mt-2">
        <Stat label="Sitting out" value={formatMoney(totals.amountCents)} tone={totals.amountCents ? "bad" : "good"} />
        <Stat label="Never billed" value={String(totals.unbilled)} />
        <Stat label="Unpaid invoices" value={String(totals.unpaid)} />
      </div>

      {groups.length ? (
        groups.map(({ group, rows }) => (
          <Card key={group} title={group} className="mt-2">
            {rows.map((row) => {
              const rowPay = row.publicToken ? invoicePayUrl(base, row.publicToken) : "";
              return (
                <div key={`${row.kind}-${row.id}`} className="collect-item">
                  <a className="rowlink" href={row.href}>
                    {row.customerName}
                  </a>
                  <div className="tiny">
                    {row.title}
                    {row.amountCents ? ` · ${formatMoney(row.amountCents)}` : ""}
                  </div>
                  <div className="collect-row-actions">
                    {row.kind === "unbilled" ? (
                      <form action={billFinishedJobAction}>
                        <input type="hidden" name="job_id" value={row.id} />
                        <button className="btn btn-sm" type="submit">
                          Bill now
                        </button>
                      </form>
                    ) : null}
                    {row.kind === "draft" ? (
                      <form action={sendCollectInvoiceAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="btn btn-sm" type="submit">
                          Send
                        </button>
                      </form>
                    ) : null}
                    {row.kind === "open" && rowPay ? (
                      <PayLinkActions
                        phone={row.phone}
                        shopName={org.name}
                        number={row.title}
                        payUrl={rowPay}
                      />
                    ) : null}
                    {row.kind === "estimate" ? (
                      <form action={convertEstimateToJobAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="btn btn-sm" type="submit">
                          Convert to job
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Card>
        ))
      ) : (
        <Empty
          title="Nothing sitting out"
          body="Finished jobs, draft invoices, unpaid invoices, and approved estimates land here."
          href="/jobs"
          action="Open jobs"
        />
      )}
    </Shell>
  );
}

import { sendInvoiceAction } from "@/app/actions";
import { invoicePaySmsBody, smsHref } from "@/lib/phone";

export function PayLinkActions({
  phone,
  shopName,
  number,
  payUrl,
  invoiceId,
  resend = false,
}: {
  phone: string;
  shopName: string;
  number: string;
  payUrl: string;
  invoiceId?: number;
  resend?: boolean;
}) {
  const sms = smsHref(
    phone,
    invoicePaySmsBody({ shopName, number, payUrl }),
  );
  return (
    <div className="row mt-1">
      {sms ? (
        <a className="btn" href={sms}>
          Text pay link
        </a>
      ) : null}
      <button className="btn btn-secondary" type="button" data-copy={payUrl}>
        Copy pay link
      </button>
      {resend && invoiceId ? (
        <form action={sendInvoiceAction}>
          <input type="hidden" name="id" value={invoiceId} />
          <button className="btn btn-secondary" type="submit">
            Resend
          </button>
        </form>
      ) : null}
    </div>
  );
}

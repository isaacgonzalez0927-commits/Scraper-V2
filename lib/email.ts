import type { EmailConfig } from "./integrations";

/**
 * Outbound email over an HTTPS API instead of SMTP, so nothing has to hold a
 * socket open on a serverless host. Resend is the supported provider today.
 */

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

export type Message = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(config: EmailConfig, message: Message): Promise<string> {
  if (!config.apiKey) throw new EmailError("No email API key is configured.");
  if (!config.fromEmail) throw new EmailError("No from address is configured.");
  if (!message.to) throw new EmailError("This customer has no email address on file.");

  const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html || undefined,
        reply_to: config.replyTo || undefined,
      }),
    });
  } catch (error) {
    throw new EmailError(`Could not reach the email provider: ${(error as Error).message}`);
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) throw new EmailError(payload.message || `Email provider returned ${response.status}.`);
  return payload.id || "";
}

export function invoiceEmail(opts: {
  shopName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  payUrl: string;
  notes?: string;
}): { subject: string; text: string; html: string } {
  const subject = `${opts.shopName}: invoice ${opts.invoiceNumber} for ${opts.amountDue}`;
  const lines = [
    `Invoice ${opts.invoiceNumber} from ${opts.shopName}`,
    "",
    `Amount due: ${opts.amountDue}`,
    `Due date: ${opts.dueDate}`,
    "",
    `View and pay: ${opts.payUrl}`,
  ];
  if (opts.notes) lines.push("", opts.notes);
  lines.push("", "Thank you for your business.");
  const text = lines.join("\n");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1b33;line-height:1.55">
      <h2 style="margin:0 0 4px;font-size:18px">Invoice ${escapeHtml(opts.invoiceNumber)}</h2>
      <p style="margin:0 0 18px;color:#6b7688">from ${escapeHtml(opts.shopName)}</p>
      <p style="margin:0 0 4px"><strong>Amount due:</strong> ${escapeHtml(opts.amountDue)}</p>
      <p style="margin:0 0 18px"><strong>Due date:</strong> ${escapeHtml(opts.dueDate)}</p>
      <p style="margin:0 0 22px">
        <a href="${escapeHtml(opts.payUrl)}"
           style="background:#5b38d6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">
          View and pay invoice
        </a>
      </p>
      ${opts.notes ? `<p style="margin:0 0 18px;color:#3f4a60">${escapeHtml(opts.notes)}</p>` : ""}
      <p style="margin:0;color:#6b7688;font-size:13px">Thank you for your business.</p>
    </div>`;
  return { subject, text, html };
}

export function invoiceReminderEmail(opts: {
  shopName: string;
  invoiceNumber: string;
  amountDue: string;
  daysOverdue: number;
  payUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `${opts.shopName}: ${opts.invoiceNumber} is still open`;
  const age = `${opts.daysOverdue} ${opts.daysOverdue === 1 ? "day" : "days"} past due`;
  const text = [
    `A quick reminder from ${opts.shopName}`,
    "",
    `Invoice ${opts.invoiceNumber} has a balance of ${opts.amountDue}.`,
    `It is ${age}.`,
    "",
    `View and pay: ${opts.payUrl}`,
    "",
    "If you already sent payment, please disregard this note. Thank you.",
  ].join("\n");
  const html = `
    <div style="
      font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      color:#0f1b33;
      line-height:1.55
    ">
      <h2 style="margin:0 0 4px;font-size:18px">A quick reminder</h2>
      <p style="margin:0 0 18px;color:#6b7688">from ${escapeHtml(opts.shopName)}</p>
      <p style="margin:0 0 4px">
        Invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong> has a balance of
        <strong>${escapeHtml(opts.amountDue)}</strong>.
      </p>
      <p style="margin:0 0 18px;color:#6b7688">It is ${escapeHtml(age)}.</p>
      <p style="margin:0 0 22px">
        <a href="${escapeHtml(opts.payUrl)}"
           style="
             background:#5b38d6;
             color:#fff;
             padding:10px 16px;
             border-radius:8px;
             text-decoration:none;
             display:inline-block
           ">
          View and pay invoice
        </a>
      </p>
      <p style="margin:0;color:#6b7688;font-size:13px">
        If you already sent payment, please disregard this note. Thank you.
      </p>
    </div>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Sending, with the guardrails that protect the mail shops actually depend on.
 *
 * Sere sends invoices from each shop's own verified domain, and a deployment
 * can hold a fallback in RESEND_API_KEY / SERE_EMAIL_FROM. Cold mail draws spam
 * complaints. Complaints burn sender reputation. If cold mail and invoices
 * share a domain or a provider account, invoices start landing in junk and it
 * looks like Sere is broken.
 *
 * So this module refuses to send unless outreach has its own domain and its own
 * API key, both different from the transactional ones. That check is not a
 * preference, it is the reason this file exists.
 */

import { sendableProblems, type Product } from "./copy";

export type Sender = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export class SendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendError";
  }
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).trim().toLowerCase();
}

/** Registrable domain, so mail.sere.cash and sere.cash count as the same. */
export function rootDomain(address: string): string {
  const parts = domainOf(address).split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export type Transactional = {
  apiKey: string;
  fromEmail: string;
};

export function transactionalFromEnv(): Transactional {
  return {
    apiKey: (process.env.RESEND_API_KEY || "").trim(),
    fromEmail: (process.env.SERE_EMAIL_FROM || "").trim(),
  };
}

export function senderFromEnv(): Sender | null {
  const apiKey = (process.env.OUTREACH_RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.OUTREACH_EMAIL_FROM || "").trim();
  if (!apiKey || !fromEmail) return null;
  return {
    apiKey,
    fromEmail,
    fromName: (process.env.OUTREACH_EMAIL_FROM_NAME || "").trim(),
    replyTo: (process.env.OUTREACH_REPLY_TO || "").trim(),
  };
}

/**
 * Everything that must be true before a single cold email goes out. Returns
 * problems rather than throwing so the CLI can print the whole list at once.
 */
export function senderProblems(sender: Sender | null, transactional: Transactional): string[] {
  const problems: string[] = [];
  if (!sender) {
    return [
      "Outreach is not configured. Set OUTREACH_RESEND_API_KEY and " +
        "OUTREACH_EMAIL_FROM to a domain you only use for cold mail — never " +
        "the domain that sends invoices.",
    ];
  }
  if (!sender.fromEmail.includes("@")) {
    problems.push("OUTREACH_EMAIL_FROM is not an email address.");
  }
  if (transactional.apiKey && sender.apiKey === transactional.apiKey) {
    problems.push(
      "Outreach is using the same provider key as invoice email. A spam " +
        "complaint would then hit the account that sends invoices. Use a " +
        "separate account.",
    );
  }
  const cold = rootDomain(sender.fromEmail);
  const warm = rootDomain(transactional.fromEmail);
  if (cold && warm && cold === warm) {
    problems.push(
      `Outreach sends from ${cold}, the same domain as invoice email. Cold ` +
        "mail would poison invoice deliverability. Use a separate domain.",
    );
  }
  return problems;
}

export type SendResult = { providerId: string };

/**
 * One email. The caller does the pacing — this deliberately has no loop, so
 * nothing in the codebase can blast a list in one call.
 */
export async function sendOutreachEmail(
  sender: Sender,
  product: Product,
  message: { to: string; subject: string; body: string },
): Promise<SendResult> {
  const problems = [
    ...senderProblems(sender, transactionalFromEnv()),
    ...sendableProblems(message.body, product),
  ];
  if (problems.length) throw new SendError(problems.join(" "));
  if (!message.to.includes("@")) throw new SendError("No recipient.");

  const from = sender.fromName
    ? `${sender.fromName} <${sender.fromEmail}>`
    : sender.fromEmail;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
        reply_to: sender.replyTo || undefined,
        headers: {
          // Lets a recipient's client offer one-click unsubscribe, which keeps
          // annoyed people from reaching for the spam button instead.
          "List-Unsubscribe": `<mailto:${sender.replyTo || sender.fromEmail}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new SendError(`Could not reach the email provider: ${(error as Error).message}`);
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) {
    throw new SendError(payload.message || `Email provider returned ${response.status}.`);
  }
  return { providerId: payload.id || "" };
}

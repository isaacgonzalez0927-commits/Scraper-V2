/**
 * QuickBooks Online over HTTPS. Shops that keep books in QBO paste an access
 * token and company (realm) id. Sere pulls customers, invoices, and payments
 * into the shop book. QBO amounts are dollars; Sere stores integer cents.
 */

import { dollarsToCents } from "./money";

const LIVE = process.env.QUICKBOOKS_API_BASE || "https://quickbooks.api.intuit.com";
const SANDBOX = process.env.QUICKBOOKS_SANDBOX_API_BASE || "https://sandbox-quickbooks.api.intuit.com";

export class QuickBooksError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "QuickBooksError";
  }
}

function hostFor(sandbox?: boolean): string {
  return sandbox ? SANDBOX : LIVE;
}

async function quickBooksRequest<T>(
  accessToken: string,
  realmId: string,
  path: string,
  sandbox?: boolean,
): Promise<T> {
  if (!accessToken || !realmId) {
    throw new QuickBooksError("An access token and company id are required.");
  }
  const url = `${hostFor(sandbox)}/v3/company/${encodeURIComponent(realmId)}${path}${
    path.includes("?") ? "&" : "?"
  }minorversion=70`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new QuickBooksError(`Could not reach QuickBooks: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    Fault?: { Error?: { Message?: string }[] };
  };
  if (!response.ok) {
    throw new QuickBooksError(
      payload.Fault?.Error?.[0]?.Message || `QuickBooks returned ${response.status}.`,
      response.status,
    );
  }
  return payload;
}

export async function quickBooksCompanyName(
  accessToken: string,
  realmId: string,
  sandbox?: boolean,
): Promise<string> {
  const payload = await quickBooksRequest<{ CompanyInfo?: { CompanyName?: string } }>(
    accessToken,
    realmId,
    `/companyinfo/${encodeURIComponent(realmId)}`,
    sandbox,
  );
  return payload.CompanyInfo?.CompanyName || `QuickBooks ${realmId}`;
}

export type QboRef = { value?: string; name?: string };

export type QboCustomer = {
  Id?: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
};

export type QboInvoiceLine = {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: { Qty?: number; UnitPrice?: number };
};

export type QboInvoice = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
  CustomerMemo?: { value?: string };
  EmailStatus?: string;
  CustomerRef?: QboRef;
  Line?: QboInvoiceLine[];
};

export type QboLinkedTxn = { TxnId?: string; TxnType?: string };

export type QboPaymentLine = {
  Amount?: number;
  LinkedTxn?: QboLinkedTxn[];
};

export type QboPayment = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number;
  PrivateNote?: string;
  CustomerRef?: QboRef;
  Line?: QboPaymentLine[];
};

/** QBO money is dollars. Sere stores integer cents. */
export function qboDollarsToCents(amount?: number | string | null): number {
  return Math.max(0, dollarsToCents(amount ?? 0));
}

export function qboLinkedInvoiceIds(payment: QboPayment): Array<{ id: string; cents: number }> {
  const rows: Array<{ id: string; cents: number }> = [];
  for (const line of payment.Line || []) {
    const cents = qboDollarsToCents(line.Amount);
    for (const txn of line.LinkedTxn || []) {
      if ((txn.TxnType || "").toLowerCase() === "invoice" && txn.TxnId) {
        rows.push({ id: txn.TxnId, cents });
      }
    }
  }
  return rows;
}

export async function retrieveQboCustomer(
  accessToken: string,
  realmId: string,
  customerId: string,
  sandbox?: boolean,
): Promise<QboCustomer | null> {
  try {
    const payload = await quickBooksRequest<{ Customer?: QboCustomer }>(
      accessToken,
      realmId,
      `/customer/${encodeURIComponent(customerId)}`,
      sandbox,
    );
    return payload.Customer || null;
  } catch {
    return null;
  }
}

export async function queryQuickBooks<T>(
  accessToken: string,
  realmId: string,
  entity: string,
  opts: { sandbox?: boolean; limit?: number } = {},
): Promise<T[]> {
  const max = opts.limit && opts.limit > 0 ? opts.limit : 100;
  const rows: T[] = [];
  let start = 1;
  while (rows.length < max) {
    const pageSize = Math.min(100, max - rows.length);
    const sql = `select * from ${entity} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
    const payload = await quickBooksRequest<{ QueryResponse?: Record<string, unknown> }>(
      accessToken,
      realmId,
      `/query?query=${encodeURIComponent(sql)}`,
      opts.sandbox,
    );
    const page = (payload.QueryResponse?.[entity] as T[] | undefined) || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    start += page.length;
  }
  return rows.slice(0, max);
}

export async function listQboInvoices(
  accessToken: string,
  realmId: string,
  opts: { sandbox?: boolean; limit?: number } = {},
): Promise<QboInvoice[]> {
  return queryQuickBooks<QboInvoice>(accessToken, realmId, "Invoice", opts);
}

export async function listQboPayments(
  accessToken: string,
  realmId: string,
  opts: { sandbox?: boolean; limit?: number } = {},
): Promise<QboPayment[]> {
  return queryQuickBooks<QboPayment>(accessToken, realmId, "Payment", opts);
}

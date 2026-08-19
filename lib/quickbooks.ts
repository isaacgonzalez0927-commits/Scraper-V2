/**
 * QuickBooks Online over HTTPS. Shops that keep books in QBO paste an access
 * token and company (realm) id. Sere only reads company info to confirm the
 * connection; invoices still live in Sere.
 */

const LIVE = process.env.QUICKBOOKS_API_BASE || "https://quickbooks.api.intuit.com";
const SANDBOX = process.env.QUICKBOOKS_SANDBOX_API_BASE || "https://sandbox-quickbooks.api.intuit.com";

export class QuickBooksError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "QuickBooksError";
  }
}

export async function quickBooksCompanyName(
  accessToken: string,
  realmId: string,
  sandbox?: boolean,
): Promise<string> {
  if (!accessToken || !realmId) throw new QuickBooksError("An access token and company id are required.");
  const host = sandbox ? SANDBOX : LIVE;
  const path = `/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}`;
  let response: Response;
  try {
    response = await fetch(`${host}${path}?minorversion=70`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new QuickBooksError(`Could not reach QuickBooks: ${(error as Error).message}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    CompanyInfo?: { CompanyName?: string };
    Fault?: { Error?: { Message?: string }[] };
  };
  if (!response.ok) {
    throw new QuickBooksError(
      payload.Fault?.Error?.[0]?.Message || `QuickBooks returned ${response.status}.`,
      response.status,
    );
  }
  return payload.CompanyInfo?.CompanyName || `QuickBooks ${realmId}`;
}

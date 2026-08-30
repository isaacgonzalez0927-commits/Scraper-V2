/** Phone and SMS links that use the tech's own phone, not a carrier API. */

export function digitsForSms(phone: string): string {
  const trimmed = (phone || "").trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return plus ? `+${digits}` : digits;
}

export function telHref(phone: string): string {
  const n = digitsForSms(phone);
  return n ? `tel:${n}` : "";
}

export function smsHref(phone: string, body: string): string {
  const n = digitsForSms(phone);
  if (!n) return "";
  return `sms:${n}?body=${encodeURIComponent(body)}`;
}

export function invoicePagePath(token: string): string {
  return `/p/inv/${token}`;
}

export function invoicePayPath(token: string): string {
  return `/p/inv/${token}/pay`;
}

export function invoicePayUrl(base: string, publicToken: string): string {
  const origin = (base || "").replace(/\/$/, "");
  return `${origin}${invoicePayPath(publicToken)}`;
}

export function customerHubUrl(base: string, publicToken: string): string {
  const origin = (base || "").replace(/\/$/, "");
  return `${origin}/p/c/${publicToken}`;
}

export function invoicePaySmsBody(opts: {
  shopName: string;
  number: string;
  payUrl: string;
}): string {
  return `Invoice ${opts.number} from ${opts.shopName}. Pay here: ${opts.payUrl}`;
}

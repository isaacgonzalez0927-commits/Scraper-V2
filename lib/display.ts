export function displayName(customer: { name: string; companyName?: string | null }) {
  if (customer.companyName && customer.companyName !== customer.name) {
    return `${customer.name} · ${customer.companyName}`;
  }
  return customer.companyName || customer.name;
}

export function formatAddress(line1: string, city: string, state: string, postal: string) {
  return [line1, [city, state, postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function toLocalInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function publicBaseUrl() {
  if (process.env.SERE_PUBLIC_BASE_URL) return process.env.SERE_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

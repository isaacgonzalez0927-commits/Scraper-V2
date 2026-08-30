/**
 * Map Jobber / Housecall Pro style client CSVs onto a Sere customer.
 * Match order for duplicates: email, then phone, then name + street.
 */

import { parseCsv } from "./csv";

export type ImportedCustomer = {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  billingLine1: string;
  billingCity: string;
  billingState: string;
  billingPostal: string;
  serviceLine1: string;
  serviceCity: string;
  serviceState: string;
  servicePostal: string;
  notes: string;
};

export type ImportMatch = {
  email?: string;
  phone?: string;
  name?: string;
  street?: string;
};

function pick(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value) return value;
  }
  return "";
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function mapImportedCustomer(row: Record<string, string>): ImportedCustomer | null {
  const first = pick(row, ["first name", "first", "firstname", "given name"]);
  const last = pick(row, ["last name", "last", "lastname", "surname"]);
  const full = pick(row, [
    "name",
    "client name",
    "customer",
    "customer name",
    "display name",
    "full name",
  ]);
  const name = full || [first, last].filter(Boolean).join(" ").trim();
  if (!name) return null;

  const serviceLine1 = pick(row, [
    "service address",
    "service street",
    "property address",
    "property street",
    "street",
    "address",
    "address 1",
    "address1",
    "billing address",
    "billing street",
  ]);
  const serviceCity = pick(row, [
    "service city",
    "property city",
    "city",
    "billing city",
  ]);
  const serviceState = pick(row, [
    "service state",
    "property state",
    "state",
    "billing state",
  ]);
  const servicePostal = pick(row, [
    "service zip",
    "service postal",
    "property zip",
    "zip",
    "zipcode",
    "postal code",
    "billing zip",
  ]);
  const billingLine1 = pick(row, ["billing address", "billing street"]) || serviceLine1;
  const billingCity = pick(row, ["billing city"]) || serviceCity;
  const billingState = pick(row, ["billing state"]) || serviceState;
  const billingPostal = pick(row, ["billing zip", "billing postal"]) || servicePostal;

  return {
    name,
    companyName: pick(row, ["company", "company name", "business name", "organization"]),
    email: pick(row, ["email", "email address", "e mail"]).toLowerCase(),
    phone: pick(row, [
      "phone",
      "mobile",
      "mobile number",
      "mobile phone",
      "phone number",
      "home phone",
      "work phone",
    ]),
    billingLine1,
    billingCity,
    billingState,
    billingPostal,
    serviceLine1,
    serviceCity,
    serviceState,
    servicePostal,
    notes: pick(row, ["notes", "note", "comments"]),
  };
}

export function parseCustomerCsv(text: string): ImportedCustomer[] {
  const { rows } = parseCsv(text);
  const out: ImportedCustomer[] = [];
  for (const row of rows) {
    const mapped = mapImportedCustomer(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

export function matchImportedCustomer(
  incoming: ImportMatch,
  existing: ImportMatch[],
): number {
  const email = (incoming.email || "").trim().toLowerCase();
  if (email) {
    const hit = existing.findIndex((row) => (row.email || "").toLowerCase() === email);
    if (hit >= 0) return hit;
  }
  const phone = digits(incoming.phone || "");
  if (phone.length >= 7) {
    const hit = existing.findIndex((row) => digits(row.phone || "") === phone);
    if (hit >= 0) return hit;
  }
  const name = (incoming.name || "").trim().toLowerCase();
  const street = (incoming.street || "").trim().toLowerCase();
  if (name && street) {
    const hit = existing.findIndex(
      (row) =>
        (row.name || "").trim().toLowerCase() === name &&
        (row.street || "").trim().toLowerCase() === street,
    );
    if (hit >= 0) return hit;
  }
  return -1;
}

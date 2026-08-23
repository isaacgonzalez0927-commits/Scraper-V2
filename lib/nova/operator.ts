/**
 * Nova is the operator's cold outreach bot. Shop owners never see her.
 * Serenity is the shop intelligence. They are not the same person.
 */

export { NOVA_MEMORY_ORG, NOVA_NAME, NOVA_PATH } from "./identity";

export function novaOperatorEmails(): string[] {
  const listed = (process.env.NOVA_OPERATOR_EMAIL || process.env.SERE_OPERATOR_EMAIL || "")
    .split(",")
    .map((row) => row.trim().toLowerCase())
    .filter(Boolean);
  const extras = [process.env.NEXUS_REPLY_TO, process.env.NEXUS_EMAIL_FROM]
    .map((row) => (row || "").trim().toLowerCase())
    .filter((row) => row.includes("@"));
  return [...new Set([...listed, ...extras])];
}

export function isNovaOperator(email: string): boolean {
  const allowed = novaOperatorEmails();
  if (allowed.length) return allowed.includes(email.trim().toLowerCase());
  return !process.env.VERCEL && process.env.NODE_ENV !== "production";
}

export const NOVA_FORBIDDEN =
  "Nova is the operator outreach bot. Shop owners talk to Serenity.";

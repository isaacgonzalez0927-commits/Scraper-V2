/** Vercel and dashboards often wrap values in quotes. Those quotes break the client. */
export function cleanEnv(value: string | undefined | null): string {
  let text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

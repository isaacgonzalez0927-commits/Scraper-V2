import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Secrets a shop pastes into Sere (Stripe keys, email API keys) are stored
 * encrypted with AES-256-GCM. The key is derived from SERE_SECRET_KEY, so
 * rotating that value makes stored secrets unreadable and they must be re-entered.
 */

const FORMAT = "v1";

function encryptionKey(): Buffer {
  const raw = process.env.SERE_SECRET_KEY || process.env.AUTH_SECRET || "sere-dev-only-change-me";
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    FORMAT,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** Returns an empty string when the value is missing, malformed, or from another key. */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  const [format, iv, tag, body] = value.split(".");
  if (format !== FORMAT || !iv || !tag || !body) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** Shows enough of a key to recognise it, never enough to use it. */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  const text = String(secret);
  if (text.length <= 8) return "••••";
  return `${text.slice(0, 7)}••••${text.slice(-4)}`;
}

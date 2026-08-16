import { compare, hash } from "bcryptjs";

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function verifyPassword(passwordHash: string, password: string) {
  return compare(password, passwordHash);
}

/** Precomputed bcrypt of `harborair` so Vercel seed does not hash on every cold start. */
export const DEMO_PASSWORD_HASH =
  "$2b$10$xEo0GRzfXUKOX67Wcjex5uEX5nQ1iKCr3rwNfTGexEAa.3UPbbxUO";

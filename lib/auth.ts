import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { memberships, organizations, users } from "./schema";

export { hashPassword, verifyPassword } from "./password";

/**
 * In-app path only. Blocks protocol-relative URLs, off-site hops, and
 * bouncing back into the auth screens.
 */
export function safeAppPath(next: string | null | undefined, fallback = "/overview"): string {
  const raw = String(next || "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  if (raw.startsWith("/login") || raw.startsWith("/signup") || raw.startsWith("/forgot")) {
    return fallback;
  }
  return raw;
}

const COOKIE = "sere_session";

function secret() {
  return new TextEncoder().encode(process.env.SERE_SECRET_KEY || process.env.AUTH_SECRET || "sere-dev-only-change-me");
}

export async function issueSessionToken(userId: number, organizationId: number): Promise<string> {
  return new SignJWT({ userId, organizationId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readSessionToken(
  token: string,
): Promise<{ userId: number; organizationId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = Number(payload.userId);
    const organizationId = Number(payload.organizationId);
    if (!userId || !organizationId) return null;
    return { userId, organizationId };
  } catch {
    return null;
  }
}

export async function createSession(userId: number, organizationId: number) {
  const jwt = await issueSessionToken(userId, organizationId);
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function readSession(): Promise<{ userId: number; organizationId: number } | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  return readSessionToken(value);
}

export async function readSessionFromRequest(
  request?: Request,
): Promise<{ userId: number; organizationId: number } | null> {
  const header = request
    ? request.headers.get("authorization") || ""
    : (await headers()).get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const fromHeader = await readSessionToken(header.slice(7).trim());
    if (fromHeader) return fromHeader;
  }
  return readSession();
}

export async function currentContext(request?: Request) {
  const session = await readSessionFromRequest(request);
  if (!session) return null;
  const [user] = await db().select().from(users).where(eq(users.id, session.userId));
  const [membership] = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, session.userId), eq(memberships.organizationId, session.organizationId)));
  if (!user || !membership) return null;
  const [org] = await db().select().from(organizations).where(eq(organizations.id, membership.organizationId));
  if (!org) return null;
  return { user, org, membership };
}

export async function requireContext() {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

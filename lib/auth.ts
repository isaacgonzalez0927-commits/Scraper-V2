import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { memberships, organizations, users } from "./schema";

const COOKIE = "sere_session";

function secret() {
  return new TextEncoder().encode(process.env.SERE_SECRET_KEY || process.env.AUTH_SECRET || "sere-dev-only-change-me");
}

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function verifyPassword(passwordHash: string, password: string) {
  return compare(password, passwordHash);
}

export async function createSession(userId: number, organizationId: number) {
  const jwt = await new SignJWT({ userId, organizationId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
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
  try {
    const { payload } = await jwtVerify(value, secret());
    const userId = Number(payload.userId);
    const organizationId = Number(payload.organizationId);
    if (!userId || !organizationId) return null;
    return { userId, organizationId };
  } catch {
    return null;
  }
}

export async function currentContext() {
  const session = await readSession();
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

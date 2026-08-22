import { eq } from "drizzle-orm";
import { createSession, currentContext, issueSessionToken, verifyPassword } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { iosSessionPayload } from "@/lib/ios";
import { memberships, organizations, users } from "@/lib/schema";
import { DEMO_EMAIL } from "@/lib/seed";
import { ensureTrialClock, shopAccess } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await boot();
  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = String(body.email || "").trim().toLowerCase();
    password = String(body.password || "");
  } catch {
    return Response.json({ error: "Send email and password." }, { status: 400 });
  }
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }
  const [user] = await db().select().from(users).where(eq(users.email, email));
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return Response.json({ error: "That email or password is not right." }, { status: 401 });
  }
  const [membership] = await db().select().from(memberships).where(eq(memberships.userId, user.id));
  if (!membership) {
    return Response.json({ error: "No company on this account." }, { status: 401 });
  }
  const [org] = await db()
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId));
  if (!org) return Response.json({ error: "No company on this account." }, { status: 401 });
  await createSession(user.id, membership.organizationId);
  const token = await issueSessionToken(user.id, membership.organizationId);
  const isDemo = user.email === DEMO_EMAIL;
  const live = await ensureTrialClock(org, isDemo);
  const access = shopAccess(live, isDemo);
  return Response.json({
    token,
    ...iosSessionPayload({ user, org: live, access }),
  });
}

export async function GET(request: Request) {
  await boot();
  const ctx = await currentContext(request);
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });
  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  return Response.json(iosSessionPayload({ ...ctx, org, access }));
}

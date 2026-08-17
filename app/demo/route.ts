import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { DEMO_EMAIL } from "@/lib/seed";
import { memberships, users } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens the Harbor Air demo without a sign in. The demo company is seeded data
 * that anyone is welcome to poke at, so this hands out a session for it and
 * nothing else. Set SERE_DEMO=0 to turn the door off, and note that
 * SERE_AUTO_SEED=0 already means there is no demo company to open.
 */
export async function GET() {
  if (process.env.SERE_DEMO === "0") {
    redirect(`/login?error=${encodeURIComponent("The demo is turned off on this deployment.")}`);
  }

  await boot();

  const [user] = await db().select().from(users).where(eq(users.email, DEMO_EMAIL));
  const [membership] = user
    ? await db().select().from(memberships).where(eq(memberships.userId, user.id))
    : [];
  if (!user || !membership) {
    redirect(`/login?error=${encodeURIComponent("There is no demo company on this deployment.")}`);
  }

  await createSession(user.id, membership.organizationId);
  redirect("/overview");
}

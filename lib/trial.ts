/**
 * 14-day trial of the book, then the shop freezes until they pay.
 * Harbor Air is not on a trial. Checkout is not live yet, so expired shops
 * stay readable and wait for billing.
 */

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireContext } from "./auth";
import { db } from "./db";
import { organizations } from "./schema";
import { DEMO_EMAIL } from "./seed";

export const TRIAL_DAYS = 14;

export const TRIAL_ENDED =
  "Trial ended. You can look, not add. Shop is $39/month when billing opens.";

export type TrialOrg = {
  plan: string;
  trialEndsAt: string;
};

export type ShopAccess = {
  frozen: boolean;
  status: "demo" | "trial" | "expired" | "paid";
  daysLeft: number | null;
  trialEndsAt: string;
  plan: string;
  banner: string;
  block: string;
};

export function addTrialDays(from: Date, days = TRIAL_DAYS): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function trialEndsISO(from: Date = new Date(), days = TRIAL_DAYS): string {
  return addTrialDays(from, days).toISOString();
}

export function daysLeft(endsAt: Date, now = new Date()): number {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export function shopAccess(
  org: TrialOrg,
  isDemo: boolean,
  now = new Date(),
): ShopAccess {
  const plan = (org.plan || "trial").trim() || "trial";
  const trialEndsAt = (org.trialEndsAt || "").trim();
  if (isDemo) {
    return {
      frozen: false,
      status: "demo",
      daysLeft: null,
      trialEndsAt: "",
      plan: "shop",
      banner: "",
      block: TRIAL_ENDED,
    };
  }
  if (plan === "shop" || plan === "crew") {
    return {
      frozen: false,
      status: "paid",
      daysLeft: null,
      trialEndsAt,
      plan,
      banner: "",
      block: TRIAL_ENDED,
    };
  }
  if (!trialEndsAt) {
    return {
      frozen: false,
      status: "trial",
      daysLeft: TRIAL_DAYS,
      trialEndsAt: "",
      plan: "trial",
      banner: `${TRIAL_DAYS} days left in your trial.`,
      block: TRIAL_ENDED,
    };
  }
  const ends = new Date(trialEndsAt);
  if (Number.isNaN(ends.getTime()) || now.getTime() >= ends.getTime()) {
    return {
      frozen: true,
      status: "expired",
      daysLeft: 0,
      trialEndsAt,
      plan: "trial",
      banner: "Trial ended. You can look, not add.",
      block: TRIAL_ENDED,
    };
  }
  const left = daysLeft(ends, now);
  return {
    frozen: false,
    status: "trial",
    daysLeft: left,
    trialEndsAt,
    plan: "trial",
    banner: left === 1 ? "Last day of your trial." : `${left} days left in your trial.`,
    block: TRIAL_ENDED,
  };
}

/**
 * New shops get a clock at signup. Existing shops with a blank clock get 14
 * days from the first load after this shipped, so nobody is frozen on deploy.
 * Harbor Air is marked Shop and never expires.
 */
export async function ensureTrialClock<T extends TrialOrg & { id: number }>(
  org: T,
  isDemo: boolean,
): Promise<T> {
  if (isDemo) {
    if (org.plan === "shop" && !org.trialEndsAt) return org;
    await db()
      .update(organizations)
      .set({ plan: "shop", trialEndsAt: "" })
      .where(eq(organizations.id, org.id));
    return { ...org, plan: "shop", trialEndsAt: "" };
  }
  if (org.plan !== "trial") return org;
  if (org.trialEndsAt) return org;
  const trialEndsAt = trialEndsISO(new Date());
  await db()
    .update(organizations)
    .set({ plan: "trial", trialEndsAt })
    .where(eq(organizations.id, org.id));
  return { ...org, plan: "trial", trialEndsAt };
}

export async function requireWritableContext(fallback = "/overview") {
  const ctx = await requireContext();
  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  if (access.frozen) {
    const glue = fallback.includes("?") ? "&" : "?";
    redirect(`${fallback}${glue}error=${encodeURIComponent(access.block)}`);
  }
  return { ...ctx, org, access };
}

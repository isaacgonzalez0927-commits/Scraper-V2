/**
 * What a local shop would actually pay, and what that money should buy.
 * Checkout is not live — these are the prices we will charge, not a paywall.
 * Signup is a 14-day trial of the book. Free is not a plan.
 */

export const PLAN_KEYS = ["shop", "crew"] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export type PlanFeature = {
  text: string;
  soon?: boolean;
};

export type Plan = {
  key: PlanKey;
  name: string;
  price: number;
  seats: number;
  priceNote: string;
  blurb: string;
  cta: string;
  featured?: boolean;
  features: readonly PlanFeature[];
};

export const PLANS: readonly Plan[] = [
  {
    key: "shop",
    name: "Shop",
    price: 39,
    seats: 2,
    priceNote: "Owner plus whoever answers the phone",
    blurb:
      "What a 1–2 truck shop should pay for an office book that shows cash, not just invoices.",
    cta: "Start 14-day trial",
    featured: true,
    features: [
      { text: "14 days of the book, then $39/month" },
      { text: "2 logins" },
      { text: "Jobs, invoices, and payments" },
      { text: "Live cash from your Stripe or Square" },
      { text: "Email the invoice" },
      { text: "CSV of jobs, invoices, and payments" },
      { text: "Sere does not take a cut of what you collect" },
    ],
  },
  {
    key: "crew",
    name: "Crew",
    price: 79,
    seats: 5,
    priceNote: "Office plus a few trucks",
    blurb:
      "What you would pay to stop texting the board around. Seats and the assistant " +
      "are here; texts and the tech phone are next.",
    cta: "Start 14-day trial",
    features: [
      { text: "5 logins" },
      { text: "Everything on Shop" },
      { text: "Assistant that knows today's board" },
      { text: "Week and month reports" },
      { text: "Texts: reminders, on-my-way, invoice link", soon: true },
      { text: "Today's jobs on the tech's phone", soon: true },
      { text: "Estimate to job to invoice", soon: true },
    ],
  },
];

export const PRICING_NOTE =
  "14 days of the book. Then the shop freezes until you pick Shop or Crew. " +
  "We are not taking cards yet — when billing opens, you pay and the shop opens again. " +
  "Card fees stay with Stripe or Square. Sere does not take a cut. No annual lock.";

export function isPlanKey(value: string | null | undefined): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value || "");
}

export function parsePlanKey(value: string | null | undefined): PlanKey | null {
  const key = (value || "").trim().toLowerCase();
  return isPlanKey(key) ? key : null;
}

export function planByKey(value: string | null | undefined): Plan | null {
  const key = parsePlanKey(value);
  return key ? PLANS.find((plan) => plan.key === key) || null : null;
}

export function formatPlanPrice(plan: Plan): string {
  return `$${plan.price}`;
}

export function signupHref(plan: Plan): string {
  return `/signup?plan=${plan.key}`;
}

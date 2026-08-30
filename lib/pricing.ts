/**
 * What a local shop would actually pay, and what that money should buy.
 * Checkout is not live. These are the prices we will charge, not a paywall.
 * Signup is a 14-day Shop trial. Crew and Pro are paid upgrades after that.
 */

export const PLAN_KEYS = ["shop", "crew", "pro"] as const;

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
    price: 49,
    seats: 2,
    priceNote: "Owner plus whoever answers the phone",
    blurb:
      "What a 1–2 truck shop should pay for an office book that shows cash, not just invoices.",
    cta: "Start 14-day Shop trial",
    featured: true,
    features: [
      { text: "2 logins" },
      { text: "House file CRM: one timeline, properties, and extra contacts" },
      { text: "Collect: finished work, drafts, and unpaid invoices in one board" },
      { text: "Estimates with customer approval" },
      { text: "Jobs, calendar, invoices, and payments" },
      { text: "Public invoice links and online payment" },
      { text: "Live cash from your Stripe or Square" },
      { text: "Serenity with included monthly credit" },
      { text: "Cash, invoice, and job-profit reports" },
      { text: "CSV import from Jobber or Housecall Pro" },
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
      "The same clean book with enough room for the office and a few trucks to work together.",
    cta: "Choose Crew after trial",
    features: [
      { text: "5 logins" },
      { text: "Everything on Shop" },
      { text: "Shared calendar and customer history" },
      { text: "Serenity for board, cash, and job questions" },
      { text: "Week, month, and custom-range reports" },
      { text: "Estimate to job to invoice" },
      { text: "Texts: reminders, on-my-way, invoice link", soon: true },
      { text: "Today's jobs on the tech's phone", soon: true },
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 149,
    seats: 10,
    priceNote: "A growing office and field crew",
    blurb:
      "The practical dispatch and customer tools a growing shop needs, without fleet hardware or enterprise bloat.",
    cta: "Choose Pro after trial",
    features: [
      { text: "10 logins" },
      { text: "Everything on Crew" },
      { text: "Recurring jobs and service plans", soon: true },
      { text: "Online booking and customer hub", soon: true },
      { text: "Crew roles and dispatch by technician", soon: true },
      { text: "Job photos, checklists, and signatures", soon: true },
      { text: "Automated estimate and invoice reminders", soon: true },
      { text: "Advanced job costing and custom reports", soon: true },
    ],
  },
];

export const PRICING_NOTE =
  "The free trial is Shop: the full office book for 14 days, no card. " +
  "Then stay on Shop for $49/month, or upgrade to Crew or Pro. No sales call and no annual lock. " +
  "Card fees stay with Stripe or Square. Sere does not take a cut.";

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

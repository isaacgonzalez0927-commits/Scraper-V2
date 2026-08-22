/**
 * The Sere setup tutorial — same job as Stripe's Developers walkthrough.
 * Numbered steps, a button in the first ones, and a short explanation of
 * how the book actually works so a new shop is not staring at empty screens.
 */

import type { TradeProfile } from "./business";

export type SereSetupStep = {
  id: string;
  body: string;
  href: string;
  action: string;
};

export type SereVoice = Pick<
  TradeProfile,
  "customer" | "customers" | "job" | "jobs" | "newCustomer" | "newJob"
>;

export function sereHowItWorks(voice: SereVoice): string[] {
  const customer = voice.customer.toLowerCase();
  const job = voice.job.toLowerCase();
  return [
    `A ${customer} is who you work for. A ${job} is the work. An invoice is what you billed. A payment is what actually landed.`,
    "An invoice is paid only when the remaining balance is zero. A partial payment leaves it open. That is on purpose.",
    "Overview is the book: collected, billed, still owed. Stripe or Square is the live rail next to those numbers, not a second set of books.",
    "Cash, check, Zelle, and Venmo get logged under Payments. Card checkout on an invoice link is optional.",
  ];
}

export function sereSetupSteps(voice: SereVoice): SereSetupStep[] {
  const customer = voice.customer.toLowerCase();
  const job = voice.job.toLowerCase();
  return [
    {
      id: "customer",
      body: `Start with a ${customer}. A name is enough. ${voice.jobs} and invoices hang off this person.`,
      href: "/customers/new",
      action: voice.newCustomer,
    },
    {
      id: "job",
      body: `Schedule the ${job} on that ${customer}. Log parts and hours so profit is real when you bill it.`,
      href: "/jobs/new",
      action: voice.newJob,
    },
    {
      id: "invoice",
      body: `When the work is done, turn it into an invoice. Send the link. The ${customer} can pay from there if Stripe is connected.`,
      href: "/invoices/new",
      action: "New invoice",
    },
    {
      id: "payment",
      body: "Record what landed — card, check, cash, Zelle. The invoice stays open until the balance hits zero.",
      href: "/payments/new",
      action: "Log a payment",
    },
    {
      id: "stripe",
      body: "Connect Stripe (or Square) the same way you just set up a restricted key. Overview then shows cash that actually landed.",
      href: "/settings?tab=integrations#stripe",
      action: "Connect Stripe",
    },
  ];
}

export function shopNeedsSetupGuide(counts: {
  customers: number;
  jobs: number;
  invoices: number;
}): boolean {
  return counts.customers === 0 || (counts.jobs === 0 && counts.invoices === 0);
}

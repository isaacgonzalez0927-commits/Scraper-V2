/**
 * Sere setup is a Stripe-style wizard: one screen, one question, Continue.
 * You stay on /setup until the last step. Links off to other pages are not
 * a setup flow.
 */

import type { TradeProfile } from "./business";

export const SERE_SETUP_STEPS = ["purpose", "customer", "job", "cash", "done"] as const;

export type SereSetupStepId = (typeof SERE_SETUP_STEPS)[number];

export type SereVoice = Pick<
  TradeProfile,
  "customer" | "customers" | "job" | "jobs" | "newCustomer" | "newJob"
>;

export const SERE_SETUP_INTENTS = ["book", "cash", "both"] as const;

export type SereSetupIntent = (typeof SERE_SETUP_INTENTS)[number];

export function parseSetupStep(value?: string | null): SereSetupStepId | undefined {
  return SERE_SETUP_STEPS.find((step) => step === value);
}

export function parseSetupIntent(value?: string | null): SereSetupIntent {
  return SERE_SETUP_INTENTS.find((intent) => intent === value) || "both";
}

/** The remaining screens after the first question, the way Stripe shortens a key wizard. */
export function setupPath(intent: SereSetupIntent = "both"): SereSetupStepId[] {
  if (intent === "cash") return ["purpose", "cash", "done"];
  if (intent === "book") return ["purpose", "customer", "job", "done"];
  return ["purpose", "customer", "job", "cash", "done"];
}

export function setupStepIndex(
  step: SereSetupStepId,
  intent: SereSetupIntent = "both",
): number {
  const index = setupPath(intent).indexOf(step);
  return index === -1 ? 0 : index;
}

export function nextSetupStep(
  step: SereSetupStepId,
  intent: SereSetupIntent = "both",
): SereSetupStepId {
  const path = setupPath(intent);
  const index = path.indexOf(step);
  return path[Math.min(Math.max(index, 0) + 1, path.length - 1)];
}

export function prevSetupStep(
  step: SereSetupStepId,
  intent: SereSetupIntent = "both",
): SereSetupStepId {
  const path = setupPath(intent);
  const index = path.indexOf(step);
  return path[Math.max(index - 1, 0)];
}

export function setupHref(step: SereSetupStepId, intent?: SereSetupIntent): string {
  const params = new URLSearchParams();
  params.set("step", step);
  if (intent && intent !== "both") params.set("intent", intent);
  return `/setup?${params.toString()}`;
}

export function setupErrorHref(
  step: SereSetupStepId,
  intent: SereSetupIntent,
  message: string,
): string {
  return `${setupHref(step, intent)}&error=${encodeURIComponent(message)}`;
}

/** Safe return path after pasting a Stripe key from the setup wizard. */
export function isSetupConnectReturn(next: string): boolean {
  if (!next.startsWith("/setup")) return false;
  let url: URL;
  try {
    url = new URL(next, "https://sere.cash");
  } catch {
    return false;
  }
  if (url.pathname !== "/setup") return false;
  for (const key of url.searchParams.keys()) {
    if (key !== "step" && key !== "intent") return false;
  }
  const step = url.searchParams.get("step");
  const intent = url.searchParams.get("intent");
  if (step && !parseSetupStep(step)) return false;
  if (intent && !SERE_SETUP_INTENTS.includes(intent as SereSetupIntent)) return false;
  return true;
}

export function inferSetupStep(state: {
  customers: number;
  jobs: number;
  stripe: boolean;
}): SereSetupStepId {
  if (!state.customers) return "purpose";
  if (!state.jobs) return "job";
  if (!state.stripe) return "cash";
  return "done";
}

export function resolveSetupStep(
  requested: string | undefined,
  state: { customers: number; jobs: number; stripe: boolean },
): SereSetupStepId {
  const asked = parseSetupStep(requested);
  if (!asked) return inferSetupStep(state);
  if (asked === "job" && !state.customers) return "customer";
  return asked;
}

export function setupPurposeChoices(voice: SereVoice): {
  value: SereSetupIntent;
  title: string;
  body: string;
}[] {
  const customer = voice.customer.toLowerCase();
  const job = voice.job.toLowerCase();
  return [
    {
      value: "book",
      title: "Run the book",
      body: `${voice.customers}, ${voice.jobs.toLowerCase()}, invoices, and what is still owed. A ${customer} is who you work for. A ${job} is the work.`,
    },
    {
      value: "cash",
      title: "See live cash",
      body: "Connect Stripe so Overview shows money that actually landed, not just invoices you typed.",
    },
    {
      value: "both",
      title: "The book and live cash",
      body: "Do the work in Sere. Let Stripe show what hit the bank. They sit next to each other. They will not always match.",
    },
  ];
}

export function setupCopy(
  step: SereSetupStepId,
  voice: SereVoice,
): { title: string; sub: string; continueLabel: string } {
  const customer = voice.customer.toLowerCase();
  const job = voice.job.toLowerCase();
  switch (step) {
    case "purpose":
      return {
        title: "How will you use Sere?",
        sub: "Pick one. Stripe asks the same kind of question before it creates a key.",
        continueLabel: "Continue",
      };
    case "customer":
      return {
        title: `Who is the first ${customer}?`,
        sub: `A ${customer} is who you work for. ${voice.jobs} and invoices hang off this person. A name is enough.`,
        continueLabel: "Continue",
      };
    case "job":
      return {
        title: `What is the first ${job}?`,
        sub: `A ${job} is the work. When it is done you invoice it. An invoice is paid only when the balance hits zero.`,
        continueLabel: "Continue",
      };
    case "cash":
      return {
        title: "See cash that actually landed",
        sub: "Create a restricted key in Stripe sandbox, then paste it here. Same walkthrough as Settings.",
        continueLabel: "Connect and continue",
      };
    case "done":
      return {
        title: "The shop is ready",
        sub: "Overview is the book. Customers, jobs, invoices, and payments stay together. You can reopen this from the sidebar.",
        continueLabel: "Open the book",
      };
  }
}

export function setupRail(
  voice: SereVoice,
  intent: SereSetupIntent = "both",
): { id: SereSetupStepId; label: string }[] {
  const labels: Record<SereSetupStepId, string> = {
    purpose: "Use",
    customer: voice.customer,
    job: voice.job,
    cash: "Cash",
    done: "Done",
  };
  return setupPath(intent).map((id) => ({ id, label: labels[id] }));
}

export function shopNeedsSetupGuide(counts: {
  customers: number;
  jobs: number;
  invoices: number;
}): boolean {
  return counts.customers === 0 || (counts.jobs === 0 && counts.invoices === 0);
}

export function setupResume(state: {
  customers: number;
  jobs: number;
  invoices: number;
  stripe: boolean;
}): { href: string; stepLabel: string; title: string; body: string } | null {
  if (!shopNeedsSetupGuide(state) && state.stripe) return null;
  if (!shopNeedsSetupGuide(state) && !state.stripe) {
    return {
      href: setupHref("cash"),
      stepLabel: "Step 4 of 5",
      title: "See live cash",
      body: "Connect Stripe so Overview shows money that actually landed.",
    };
  }
  const step = inferSetupStep(state);
  const index = setupStepIndex(step, "both") + 1;
  const titles: Record<SereSetupStepId, string> = {
    purpose: "How will you use Sere?",
    customer: "Add the first customer",
    job: "Add the first job",
    cash: "See live cash",
    done: "The shop is ready",
  };
  return {
    href: setupHref(step),
    stepLabel: `Step ${index} of ${SERE_SETUP_STEPS.length}`,
    title: titles[step],
    body: "One screen at a time, the same way Stripe walks a new key.",
  };
}

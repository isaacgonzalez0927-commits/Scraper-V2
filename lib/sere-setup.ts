/**
 * Sere setup is a Stripe Setup Guide: a live checklist on the dashboard.
 * Completing real work (a customer, a job, an invoice, a key) checks items
 * off. Progress is the shop's data, so it is still there when you come back.
 */

import type { TradeField, TradeProfile } from "./business";

export type SereVoice = Pick<
  TradeProfile,
  "customer" | "customers" | "job" | "jobs" | "newCustomer" | "newJob" | "jobTitleLabel" | "jobPlaceholder"
>;

export const SETUP_MILESTONES = ["shop", "customer", "job", "invoice", "cash"] as const;

export type SetupMilestoneId = (typeof SETUP_MILESTONES)[number];

export type SetupItemState = "done" | "open" | "locked";

export type SetupRequirement = {
  id: string;
  label: string;
  done: boolean;
  tip?: string;
};

export type SetupMilestone = {
  id: SetupMilestoneId;
  title: string;
  body: string;
  state: SetupItemState;
  lockReason?: string;
  requirements: SetupRequirement[];
};

export type SetupSnapshot = {
  shopName: string;
  shopPhone: string;
  shopEmail: string;
  trade: string;
  customers: number;
  jobs: number;
  invoices: number;
  stripe: boolean;
  latestCustomerId?: number;
  latestCustomerName?: string;
  latestJobId?: number;
  latestJobTitle?: string;
};

export type SetupGuideView = {
  complete: boolean;
  percent: number;
  done: number;
  total: number;
  nextId: SetupMilestoneId | null;
  nextLabel: string | null;
  milestones: SetupMilestone[];
};

export type SetupField = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
};

export function setupFields(fields: readonly TradeField[], cap = 3): SetupField[] {
  return fields.slice(0, cap).map((item) => ({
    key: item.key,
    label: item.label,
    placeholder: item.placeholder,
    help: item.help,
  }));
}

export function buildSetupGuide(state: SetupSnapshot, voice: SereVoice): SetupGuideView {
  const shopReady = Boolean(state.shopName.trim());
  const hasCustomer = state.customers > 0;
  const hasJob = state.jobs > 0;
  const hasInvoice = state.invoices > 0;
  const hasCash = state.stripe;
  const customer = voice.customer.toLowerCase();
  const job = voice.job.toLowerCase();

  const milestones: SetupMilestone[] = [
    {
      id: "shop",
      title: "Tell us about the shop",
      body: "Name, trade, and how to reach you. Same first mile as Stripe's profile step.",
      state: shopReady ? "done" : "open",
      requirements: [
        { id: "name", label: "Shop name", done: shopReady, tip: "This is what prints on invoices." },
        {
          id: "trade",
          label: "What you do",
          done: Boolean(state.trade.trim()),
          tip: "Sere uses your words for customers and jobs.",
        },
        {
          id: "phone",
          label: "Shop phone",
          done: Boolean(state.shopPhone.trim()),
          tip: "Optional. Customers see it on the invoice.",
        },
      ],
    },
    {
      id: "customer",
      title: `Add a ${customer}`,
      body: `A ${customer} is who you work for. ${voice.jobs} and invoices hang off this person.`,
      state: hasCustomer ? "done" : "open",
      requirements: [
        {
          id: "record",
          label: `First ${customer} on file`,
          done: hasCustomer,
          tip: "A name is enough. Phone and email help later.",
        },
      ],
    },
    {
      id: "job",
      title: `Add a ${job}`,
      body: `A ${job} is the work. When it is done you invoice it.`,
      state: hasJob ? "done" : hasCustomer ? "open" : "locked",
      lockReason: `Add a ${customer} first.`,
      requirements: [
        {
          id: "record",
          label: `First ${job} scheduled or logged`,
          done: hasJob,
          tip: `Needs a ${customer} so the work has someone to bill.`,
        },
      ],
    },
    {
      id: "invoice",
      title: "Create an invoice",
      body: "An invoice is what you billed. It stays open until payments add up to the total.",
      state: hasInvoice ? "done" : hasJob ? "open" : "locked",
      lockReason: `Add a ${job} first.`,
      requirements: [
        {
          id: "record",
          label: "First invoice",
          done: hasInvoice,
          tip: "Paid only when the remaining balance is zero. That is on purpose.",
        },
      ],
    },
    {
      id: "cash",
      title: "Connect live cash",
      body: "Paste a Stripe restricted key. Overview then shows money that actually landed.",
      state: hasCash ? "done" : "open",
      requirements: [
        {
          id: "key",
          label: "Stripe restricted key",
          done: hasCash,
          tip: "rk_test_ or rk_live_ only. The full sk_ key can move money. Never paste that.",
        },
      ],
    },
  ];

  const done = milestones.filter((item) => item.state === "done").length;
  const total = milestones.length;
  const next = milestones.find((item) => item.state === "open") || null;

  return {
    complete: done === total,
    percent: Math.round((done / total) * 100),
    done,
    total,
    nextId: next?.id || null,
    nextLabel: next ? next.title : null,
    milestones,
  };
}

export function shopNeedsSetupGuide(state: Pick<SetupSnapshot, "customers" | "jobs" | "invoices" | "stripe">): boolean {
  return !buildSetupGuide(
    {
      shopName: "shop",
      shopPhone: "",
      shopEmail: "",
      trade: "general",
      ...state,
    },
    {
      customer: "Customer",
      customers: "Customers",
      job: "Job",
      jobs: "Jobs",
      newCustomer: "New customer",
      newJob: "New job",
      jobTitleLabel: "Title",
      jobPlaceholder: "Work",
    },
  ).complete;
}

export function isSafeAppPath(next: string): boolean {
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  if (next.startsWith("/api") || next.startsWith("/p/")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(next)) return false;
  return true;
}

export function withQuery(path: string, key: string, value: string): string {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}${key}=${encodeURIComponent(value)}`;
}

export function validateSetupName(value: string): string {
  if (!value.trim()) return "A name is required.";
  return "";
}

export function validateSetupEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "That email does not look right.";
  return "";
}

export function validateSetupAmount(value: string): string {
  const n = Number(String(value).replace(/[$,]/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return "Enter an amount greater than zero.";
  return "";
}

export function validateSetupKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Paste the restricted key.";
  if (trimmed.startsWith("sk_")) return "That is the full secret key. Sere only accepts rk_test_ or rk_live_.";
  if (!trimmed.startsWith("rk_test_") && !trimmed.startsWith("rk_live_")) {
    return "Use an rk_test_ or rk_live_ restricted key.";
  }
  return "";
}

import { addDaysISO } from "./labels";
import { dollarsToCents } from "./money";

export type CloseoutDraft =
  | {
      ok: true;
      workCompleted: string;
      finalAmountCents: number;
      extraCostCents: number;
      costDescription: string;
      costCategory: string;
    }
  | { ok: false; error: string };

/**
 * Normalizes the few things a tech must record before leaving the driveway.
 * Keeping this pure makes the money and required-field rules testable without
 * a database or a browser.
 */
export function parseCloseout(input: {
  workCompleted: string;
  finalAmount: string;
  fallbackAmountCents: number;
  extraCost?: string;
  costDescription?: string;
  costCategory?: string;
}): CloseoutDraft {
  const workCompleted = input.workCompleted.trim();
  if (!workCompleted) {
    return { ok: false, error: "Say what was completed before closing the job." };
  }

  let finalAmountCents = 0;
  let extraCostCents = 0;
  try {
    finalAmountCents = input.finalAmount.trim()
      ? dollarsToCents(input.finalAmount)
      : Math.max(0, input.fallbackAmountCents);
    extraCostCents = dollarsToCents(input.extraCost || "");
  } catch {
    return { ok: false, error: "Use dollars and cents for the final charge and cost." };
  }

  if (finalAmountCents <= 0) {
    return { ok: false, error: "Enter the final amount to bill." };
  }
  if (extraCostCents < 0) {
    return { ok: false, error: "The extra cost cannot be negative." };
  }

  const costDescription = (input.costDescription || "").trim();
  if (extraCostCents > 0 && !costDescription) {
    return { ok: false, error: "Name the part or cost you are adding." };
  }

  return {
    ok: true,
    workCompleted,
    finalAmountCents,
    extraCostCents,
    costDescription,
    costCategory: (input.costCategory || "miscellaneous").trim() || "miscellaneous",
  };
}

/** Calendar-day invoice terms from the day the work is closed. */
export function closeoutDueDate(issueDate: string, termsDays: number): string {
  return addDaysISO(issueDate, Math.max(0, Math.trunc(termsDays)));
}

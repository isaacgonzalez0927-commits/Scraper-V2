/**
 * Per-shop monthly credit on Sere's OpenAI key.
 *
 * Shops never paste a key. Each organization gets a $3.00 allowance that
 * resets on the UTC month boundary. Cost is integer micros of USD
 * ($1.00 = 1_000_000 micros) from published token rates.
 *
 * Nexus outreach is billed to the operator, not to a shop, and does not
 * call these helpers.
 */

import { and, eq } from "drizzle-orm";
import { db, nowISO } from "./db";
import { formatMoney } from "./money";
import { openaiUsage, openaiUsageEvents } from "./schema";

export const USD_MICROS = 1_000_000;
export const DEFAULT_SHOP_BUDGET_MICROS = 3 * USD_MICROS;

export class OpenAIBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIBudgetError";
  }
}

export type OpenAIUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ShopCredit = {
  month: string;
  spentMicros: number;
  budgetMicros: number;
  remainingMicros: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
  exhausted: boolean;
};

type ModelRate = {
  /** Micros of USD per 1_000_000 prompt tokens. */
  inputPerMillion: number;
  /** Micros of USD per 1_000_000 completion tokens. */
  outputPerMillion: number;
};

/**
 * OpenAI list prices used to debit the shop credit. Prefer over-counting an
 * unknown model (gpt-4o rates) so a new name cannot dodge the cap.
 * https://openai.com/api/pricing
 */
const RATES: Record<string, ModelRate> = {
  "gpt-4o-mini": { inputPerMillion: 150_000, outputPerMillion: 600_000 },
  "gpt-4o": { inputPerMillion: 2_500_000, outputPerMillion: 10_000_000 },
  "gpt-4.1-mini": { inputPerMillion: 400_000, outputPerMillion: 1_600_000 },
  "gpt-4.1": { inputPerMillion: 2_000_000, outputPerMillion: 8_000_000 },
};

export function shopBudgetMicros(): number {
  const raw = Number(process.env.OPENAI_SHOP_BUDGET_DOLLARS || "3");
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SHOP_BUDGET_MICROS;
  return Math.round(raw * USD_MICROS);
}

export function billingMonth(at = new Date()): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function ratesForModel(model: string): ModelRate {
  const key = model.trim().toLowerCase();
  if (key.startsWith("gpt-4o-mini")) return RATES["gpt-4o-mini"];
  if (key.startsWith("gpt-4.1-mini")) return RATES["gpt-4.1-mini"];
  if (key.startsWith("gpt-4.1")) return RATES["gpt-4.1"];
  if (key.startsWith("gpt-4o")) return RATES["gpt-4o"];
  return RATES["gpt-4o"];
}

export function usageCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = ratesForModel(model);
  const prompt = Math.max(0, Math.trunc(promptTokens || 0));
  const completion = Math.max(0, Math.trunc(completionTokens || 0));
  return Math.ceil(
    (prompt * rates.inputPerMillion + completion * rates.outputPerMillion) / 1_000_000,
  );
}

export function formatUsdFromMicros(micros: number): string {
  const cents = Math.round(Math.max(0, Math.trunc(micros || 0)) / 10_000);
  return formatMoney(cents);
}

export function estimatedUsage(kind: "assistant" | "serenity"): OpenAIUsage {
  if (kind === "assistant") return { promptTokens: 1200, completionTokens: 200 };
  return { promptTokens: 2500, completionTokens: 400 };
}

function emptyCredit(month: string): ShopCredit {
  const budgetMicros = shopBudgetMicros();
  return {
    month,
    spentMicros: 0,
    budgetMicros,
    remainingMicros: budgetMicros,
    promptTokens: 0,
    completionTokens: 0,
    callCount: 0,
    exhausted: false,
  };
}

function toCredit(
  month: string,
  row: {
    costMicros: number;
    promptTokens: number;
    completionTokens: number;
    callCount: number;
  } | null,
): ShopCredit {
  const budgetMicros = shopBudgetMicros();
  const spentMicros = Math.max(0, row?.costMicros || 0);
  const remainingMicros = Math.max(0, budgetMicros - spentMicros);
  return {
    month,
    spentMicros,
    budgetMicros,
    remainingMicros,
    promptTokens: row?.promptTokens || 0,
    completionTokens: row?.completionTokens || 0,
    callCount: row?.callCount || 0,
    exhausted: remainingMicros <= 0,
  };
}

export function creditExhaustedMessage(credit: ShopCredit): string {
  return (
    `This shop used its ${formatUsdFromMicros(credit.budgetMicros)} Serenity ` +
    "credit for the month. It resets on the 1st."
  );
}

export async function loadShopCredit(
  organizationId: number,
  at = new Date(),
): Promise<ShopCredit> {
  const month = billingMonth(at);
  try {
    const [row] = await db()
      .select()
      .from(openaiUsage)
      .where(
        and(eq(openaiUsage.organizationId, organizationId), eq(openaiUsage.month, month)),
      );
    return toCredit(month, row || null);
  } catch {
    return emptyCredit(month);
  }
}

export async function assertShopCredit(
  organizationId: number,
  at = new Date(),
): Promise<ShopCredit> {
  const credit = await loadShopCredit(organizationId, at);
  if (credit.exhausted) {
    throw new OpenAIBudgetError(creditExhaustedMessage(credit));
  }
  return credit;
}

export async function recordShopUsage(
  organizationId: number,
  input: {
    source: "serenity" | "assistant";
    model: string;
    promptTokens: number;
    completionTokens: number;
    at?: Date;
  },
): Promise<ShopCredit> {
  const at = input.at || new Date();
  const month = billingMonth(at);
  const promptTokens = Math.max(0, Math.trunc(input.promptTokens || 0));
  const completionTokens = Math.max(0, Math.trunc(input.completionTokens || 0));
  const costMicros = usageCostMicros(input.model, promptTokens, completionTokens);
  const now = nowISO();
  try {
    const [row] = await db()
      .select()
      .from(openaiUsage)
      .where(
        and(eq(openaiUsage.organizationId, organizationId), eq(openaiUsage.month, month)),
      );
    if (row) {
      await db()
        .update(openaiUsage)
        .set({
          promptTokens: row.promptTokens + promptTokens,
          completionTokens: row.completionTokens + completionTokens,
          costMicros: row.costMicros + costMicros,
          callCount: row.callCount + 1,
          updatedAt: now,
        })
        .where(eq(openaiUsage.id, row.id));
    } else {
      await db().insert(openaiUsage).values({
        organizationId,
        month,
        promptTokens,
        completionTokens,
        costMicros,
        callCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db().insert(openaiUsageEvents).values({
      organizationId,
      month,
      source: input.source,
      model: input.model,
      promptTokens,
      completionTokens,
      costMicros,
      createdAt: now,
    });
  } catch (error) {
    console.error("openai usage record failed", error);
  }
  return loadShopCredit(organizationId, at);
}

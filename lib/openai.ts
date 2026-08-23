/**
 * OpenAI over plain HTTPS. No SDK.
 *
 * Shops never paste a key. The operator sets OPENAI_API_KEY (or
 * NOVA_OPENAI_API_KEY). Each shop is capped at $3/month in lib/openai-budget.ts.
 */

import type { OpenAIUsage } from "./openai-budget";

const API = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/** Short JSON replies. gpt-4o-mini at this size stays well under a $3 month. */
export const OPENAI_MAX_TOKENS = 400;

export class OpenAIError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OpenAIError";
  }
}

/**
 * User keys look like sk-... or sk-proj-.... Stripe secrets are sk_live_ / sk_test_
 * and must not be stored as OpenAI keys.
 */
export function looksLikeOpenAIKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length < 20) return false;
  if (/^sk_(live|test)_/.test(trimmed)) return false;
  return /^sk-/.test(trimmed);
}

export type OpenAICredentials = {
  apiKey: string;
  model: string;
};

export function openaiFromEnv(): OpenAICredentials | null {
  const apiKey = (
    process.env.OPENAI_API_KEY ||
    process.env.NOVA_OPENAI_API_KEY ||
    ""
  ).trim();
  if (!looksLikeOpenAIKey(apiKey)) return null;
  const model = (process.env.OPENAI_MODEL || "").trim() || DEFAULT_OPENAI_MODEL;
  return { apiKey, model };
}

export type OpenAIChatJson = {
  intent?: string;
  when?: string;
  filter?: string;
  query?: string;
  date?: string;
  reply?: string;
};

export type OpenAICompletion = {
  plan: OpenAIChatJson;
  usage: OpenAIUsage;
};

async function openaiFetch(apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  if (!apiKey) throw new OpenAIError("No OpenAI API key is configured.");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: init.signal || AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new OpenAIError(`Could not reach OpenAI: ${(error as Error).message}`);
  }
  return response;
}

function errorMessage(payload: unknown, fallback: string): string {
  const err = payload as { error?: { message?: string } };
  return err?.error?.message || fallback;
}

function readUsage(payload: {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): OpenAIUsage {
  return {
    promptTokens: Math.max(0, Math.trunc(payload.usage?.prompt_tokens || 0)),
    completionTokens: Math.max(0, Math.trunc(payload.usage?.completion_tokens || 0)),
  };
}

/**
 * Asks the model for a JSON plan. Sere then either answers in text or runs a
 * known assistant intent. The model never writes to the database.
 */
export async function completeShopJson(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<OpenAICompletion> {
  const response = await openaiFetch(apiKey, "/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: OPENAI_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!response.ok) {
    throw new OpenAIError(errorMessage(payload, "OpenAI could not answer."), response.status);
  }
  const content = payload.choices?.[0]?.message?.content || "";
  let plan: OpenAIChatJson;
  try {
    plan = JSON.parse(content) as OpenAIChatJson;
  } catch {
    throw new OpenAIError("OpenAI returned something that was not JSON.");
  }
  return { plan, usage: readUsage(payload) };
}

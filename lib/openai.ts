/**
 * OpenAI over plain HTTPS. No SDK. Each shop pastes its own key so answers
 * about that shop go to that shop's OpenAI account, not a shared Sere key.
 */

const API = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

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

export type OpenAIChatJson = {
  intent?: string;
  when?: string;
  filter?: string;
  query?: string;
  date?: string;
  reply?: string;
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

/** Confirms the key can list models before Sere stores it. */
export async function validateOpenAIKey(apiKey: string): Promise<string> {
  const response = await openaiFetch(apiKey, "/models");
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (response.status === 401) {
    throw new OpenAIError("That OpenAI key was rejected.");
  }
  if (!response.ok) {
    throw new OpenAIError(errorMessage(payload, "OpenAI did not accept that key."), response.status);
  }
  return `OpenAI · ${DEFAULT_OPENAI_MODEL}`;
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
): Promise<OpenAIChatJson> {
  const response = await openaiFetch(apiKey, "/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
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
  };
  if (!response.ok) {
    throw new OpenAIError(errorMessage(payload, "OpenAI could not answer."), response.status);
  }
  const content = payload.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content) as OpenAIChatJson;
  } catch {
    throw new OpenAIError("OpenAI returned something that was not JSON.");
  }
}

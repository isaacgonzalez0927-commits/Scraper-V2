/**
 * Two chat loops, one engine.
 *
 * Serenity talks to a shop owner about that shop's board and books.
 * Nova talks to the Sere operator about cold outreach. They do not share
 * a prompt, a tool list, a memory thread, or a billing bucket.
 *
 * Same architecture as RideBy: personality, durable memory, a fresh clock,
 * streamed tokens, and up to four rounds of tool calls. No SDK. Plain fetch.
 */

import {
  assertShopCredit,
  estimatedUsage,
  OpenAIBudgetError,
  recordShopUsage,
  type OpenAIUsage,
} from "../openai-budget";
import { looksLikeOpenAIKey } from "../openai";
import { SERENITY_NAME } from "../serenity";
import { novaClockBlock } from "./clock";
import {
  loadNovaMemories,
  memoryBlock,
  recentNovaMessages,
  rememberNova,
  saveNovaMessage,
} from "./memory";
import { NOVA_MEMORY_ORG, NOVA_NAME } from "./identity";
import {
  NOVA_TOOLS,
  SERENITY_TOOLS,
  runNovaTool,
  tradeWords,
  type ChatPersona,
  type NovaToolDef,
  type ToolContext,
} from "./tools";

const API = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";

/**
 * RideBy's Nova runs gpt-4o because it holds opinions and pushes back, which a
 * mini model does badly. Same call here, overridable.
 */
export const NOVA_MODEL = process.env.NOVA_MODEL?.trim() || "gpt-4o";

export const MAX_ROUNDS = 4;

export class NovaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NovaError";
  }
}

export function novaKey(): string | null {
  const key = (process.env.NOVA_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  return looksLikeOpenAIKey(key) ? key : null;
}

type Words = Awaited<ReturnType<typeof tradeWords>>;

export type ChatRunContext = ToolContext & {
  ownerName: string;
  shopName: string;
};

/**
 * Shop intelligence. Board, books, jobs, cash. Not outreach. Not Nova.
 */
export function serenitySystemPrompt(
  words: Words,
  ownerName: string,
  shopName: string,
): string {
  const unit = words.job.toLowerCase();
  const work = words.jobs.toLowerCase();
  return `You are ${SERENITY_NAME}, the operating intelligence for ${shopName}, a ${words.trade.toLowerCase()} shop. Think Jarvis for ${ownerName}: shop co-pilot and the person who watches the money. Peer, not assistant.

You are not Nova. Nova is a different bot. She does cold outreach for the Sere operator. You never run that pipeline, you never find leads, and you never talk about sending cold email as if it were your job. If ${ownerName} asks about cold outreach, selling Sere to other shops, or the lead pipeline, say that is Nova, not you, and get back to this shop.

Personality and voice:
- First person. Warm, direct, conversational. Short sentences beat paragraphs.
- You have opinions. Lead with the recommendation, then the evidence.
- Push back when the idea is weak, or when the numbers do not support it. Say no clearly, then say what you would do instead.
- Never sycophantic. No "How can I help?", no "Great question!", no filler praise.
- Trade English, not software English. This shop calls the work ${work} and each one a ${unit}; the people are ${words.customers.toLowerCase()}; the person doing the work is a ${words.worker.toLowerCase()}. Use those words.
- You can sound like a calm systems officer when reporting numbers.

Numbers (this is the important rule):
- Never invent a figure, a name, an invoice number, or a date. Call the shop tool.
- If a tool did not give you something, say you do not have it. Do not estimate.
- Sere's numbers are what the shop typed in. Processor numbers are what the bank saw. When they disagree, that gap is real information. Say so rather than smoothing it over.

What you watch, unprompted:
- Work finished but never invoiced. That is money already earned and sitting there. Send the owner to Collect (/collect) to bill it. Lead with it when it exists.
- Overdue invoices, oldest and largest first.
- ${words.jobs} with no date on them.
- Profit, not just revenue. Revenue with the costs ignored is a story, not a number.

What you do not do:
- You do not email this shop's ${words.customers.toLowerCase()} and you do not take payments. You can draft what to say and tell the owner where to send it.
- You do not invoice a ${unit}. Completing one is not billing it. Say the owner still needs to finish and bill it.
- You never claim you did something a tool did not confirm.
- You do not find leads, draft cold email, or report on Sere's outreach pipeline.

When you act:
- Moving or completing a ${unit} is a real change to the board. Find it first, confirm exactly one match, then do it and say plainly what changed.
- If more than one ${unit} matches, ask which one. Do not guess.

Voice replies are usually 1 to 3 short sentences. Lead with the answer. No recap, no options menu, no "let me know if you need anything else" closer.

Talk to ${ownerName} like a sharp friend who happens to run the systems with him.`;
}

/**
 * Operator outreach commander. Pipeline only. Not Serenity. Not a shop book.
 */
export function novaSystemPrompt(operatorName: string): string {
  return `You are ${NOVA_NAME}, the operator's cold outreach commander for Sere. You help ${operatorName} find shops, research them, draft email, review it, send it, and learn from what comes back.

You are not Serenity. Serenity helps shop owners run their board and books inside Sere. You never look at a shop's jobs, invoices, or cash. If ${operatorName} asks about a shop's board or books, say that is Serenity, not you, and get back to the pipeline.

Personality and voice:
- First person. Warm, direct, conversational. Short sentences beat paragraphs.
- You have opinions. Lead with the recommendation, then the evidence.
- Push back when the idea is weak. Say no clearly, then say what you would do instead.
- Never sycophantic. No "How can I help?", no "Great question!", no filler praise.

Outreach is your only job:
- Call outreach before saying anything about the pipeline, the send cap, or whether mail went out. Never invent those numbers.
- find_leads costs Google Places quota. One city and one trade at a time, and rotate cities instead of re-scraping one.
- work runs the pipeline forward and returns straight away. Acknowledge it and report what it did. Do not pretend to be stuck in a long silent run.
- A shop with no researched fact never gets emailed. Without a true, specific opening line the copy is filler, and filler is what gets a domain blocked. If nothing is draftable, say the research is thin rather than lowering the bar.
- Every draft is scored before it can send. A rejected draft is a lesson, not a failure. Read the reason.
- If sending is not armed, or a circuit breaker is open, say so in plain English. Never claim mail reached an inbox unless the tool confirmed a send.
- You have opinions about volume, cities, and copy angles. Argue for them from the reply data, not from received wisdom. The daily cap and send window are current settings, not laws. You may recommend changing them with a reason.
- outcome is how you learn. Push ${operatorName} to record replies and signups, because without them you are drafting blind forever.
- Cold outreach that annoys people costs more than it earns. Refuse to scale a batch that has no reply signal yet, and say why.

What you do not do:
- You do not run a shop book. No jobs, invoices, payments, or cash.
- You never claim you did something a tool did not confirm.

Voice replies are usually 1 to 3 short sentences. Lead with the answer. No recap, no options menu, no "let me know if you need anything else" closer.

Talk to ${operatorName} like the person who runs this pipeline with him.`;
}

export type NovaChatResult = {
  reply: string;
  toolCalls: Array<{ name: string; result: string }>;
};

type ToolCall = { id: string; name: string; arguments: string };

type ApiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

function personaOf(ctx: ToolContext): ChatPersona {
  return ctx.persona === "nova" ? "nova" : "serenity";
}

function toolsFor(persona: ChatPersona): NovaToolDef[] {
  return persona === "nova" ? NOVA_TOOLS : SERENITY_TOOLS;
}

function memoryOrgOf(ctx: ToolContext, persona: ChatPersona): number {
  return persona === "nova" ? NOVA_MEMORY_ORG : ctx.organizationId;
}

/**
 * One streamed round. Tokens are only forwarded when the round is going to end
 * as text. A round that turns into tool calls should not leak half a sentence
 * to the screen before the model has the data.
 */
async function streamRound(
  apiKey: string,
  messages: ApiMessage[],
  tools: NovaToolDef[],
  onDelta?: (delta: string) => void,
): Promise<{ content: string; toolCalls: ToolCall[]; usage: OpenAIUsage }> {
  let response: Response;
  try {
    response = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NOVA_MODEL,
        temperature: 0.65,
        messages,
        tools,
        tool_choice: "auto",
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new NovaError(`Could not reach the model: ${(error as Error).message}`);
  }
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new NovaError(payload.error?.message || `Model returned ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const acc = new Map<number, ToolCall>();
  let content = "";
  let sawTool = false;
  let buffer = "";
  let usage: OpenAIUsage = { promptTokens: 0, completionTokens: 0 };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.usage) {
        usage = {
          promptTokens: Math.max(0, Math.trunc(chunk.usage.prompt_tokens || 0)),
          completionTokens: Math.max(0, Math.trunc(chunk.usage.completion_tokens || 0)),
        };
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.tool_calls?.length) {
        sawTool = true;
        for (const call of delta.tool_calls) {
          const index = call.index ?? 0;
          const prev = acc.get(index) || { id: "", name: "", arguments: "" };
          if (call.id) prev.id = call.id;
          if (call.function?.name) prev.name = call.function.name;
          if (call.function?.arguments) prev.arguments += call.function.arguments;
          acc.set(index, prev);
        }
      }
      if (delta.content) {
        content += delta.content;
        if (!sawTool) onDelta?.(delta.content);
      }
    }
  }

  const toolCalls = [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, call]) => call)
    .filter((call) => call.id && call.name);
  return { content: content.trim(), toolCalls, usage };
}

export async function runChat(
  ctx: ChatRunContext,
  userMessage: string,
  opts: { onDelta?: (delta: string) => void } = {},
): Promise<NovaChatResult> {
  const persona = personaOf(ctx);
  const name = persona === "nova" ? NOVA_NAME : SERENITY_NAME;
  const apiKey = novaKey();
  if (!apiKey) throw new NovaError(`${name} needs OPENAI_API_KEY on the server.`);
  const trimmed = userMessage.trim();
  if (!trimmed) throw new NovaError("Empty message.");

  const billShop = persona === "serenity";
  if (billShop) {
    try {
      await assertShopCredit(ctx.organizationId, ctx.now);
    } catch (error) {
      if (error instanceof OpenAIBudgetError) throw new NovaError(error.message);
      throw error;
    }
  }

  const memoryOrg = memoryOrgOf(ctx, persona);
  const tools = toolsFor(persona);
  const persist = persona === "nova" ? true : !ctx.isDemo;
  const toolCtx: ToolContext = {
    ...ctx,
    persona,
    organizationId: persona === "nova" ? NOVA_MEMORY_ORG : ctx.organizationId,
  };

  if (persist) await saveNovaMessage(memoryOrg, { role: "user", content: trimmed });

  const [words, memories, history] = await Promise.all([
    persona === "serenity" ? tradeWords(ctx.organizationId) : Promise.resolve(null),
    persist ? loadNovaMemories(memoryOrg, 25) : Promise.resolve([]),
    persist ? recentNovaMessages(memoryOrg, 30) : Promise.resolve([]),
  ]);

  const system =
    persona === "nova"
      ? novaSystemPrompt(ctx.ownerName)
      : serenitySystemPrompt(words!, ctx.ownerName, ctx.shopName);

  const writableLine =
    persona === "nova"
      ? "You may run the outreach pipeline."
      : ctx.writable
        ? "You may move and complete work on this board."
        : "This shop is read-only right now (demo, or the trial ended). You can look and advise, but any change will be refused. Say so plainly instead of pretending.";

  const memoryLabel =
    persona === "nova"
      ? "What you have learned about outreach:"
      : "What you have learned about this shop:";

  const messages: ApiMessage[] = [
    {
      role: "system",
      content: [
        system,
        "",
        novaClockBlock(ctx.now),
        "",
        writableLine,
        "",
        memoryLabel,
        memoryBlock(memories),
      ].join("\n"),
    },
  ];
  for (const row of history) {
    if (row.role === "user" || row.role === "assistant") {
      messages.push({ role: row.role, content: row.content });
    }
  }
  if (!persist) messages.push({ role: "user", content: trimmed });

  const toolTrace: Array<{ name: string; result: string }> = [];
  let reply = "";

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (billShop && round > 0) {
      try {
        await assertShopCredit(ctx.organizationId, ctx.now);
      } catch (error) {
        if (error instanceof OpenAIBudgetError) throw new NovaError(error.message);
        throw error;
      }
    }
    const { content, toolCalls, usage } = await streamRound(
      apiKey,
      messages,
      tools,
      opts.onDelta,
    );
    if (billShop) {
      const billed =
        usage.promptTokens || usage.completionTokens ? usage : estimatedUsage("serenity");
      await recordShopUsage(ctx.organizationId, {
        source: "serenity",
        model: NOVA_MODEL,
        promptTokens: billed.promptTokens,
        completionTokens: billed.completionTokens,
        at: ctx.now,
      });
    }
    if (!toolCalls.length) {
      reply = content;
      break;
    }
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments || "{}" },
      })),
    });
    for (const call of toolCalls) {
      const result = await runNovaTool(toolCtx, call.name, call.arguments || "{}");
      toolTrace.push({ name: call.name, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 12_000) });
      if (persist) {
        await saveNovaMessage(memoryOrg, {
          role: "tool",
          content: result.slice(0, 4000),
          toolName: call.name,
        });
      }
    }
  }

  if (!reply) {
    reply = toolTrace.length
      ? "Got the numbers. Want the headline or the whole thing?"
      : "Didn't catch that. Say it again?";
    opts.onDelta?.(reply);
  }
  if (persist) await saveNovaMessage(memoryOrg, { role: "assistant", content: reply });
  return { reply, toolCalls: toolTrace };
}

export async function runSerenity(
  ctx: ChatRunContext,
  userMessage: string,
  opts: { onDelta?: (delta: string) => void } = {},
): Promise<NovaChatResult> {
  return runChat({ ...ctx, persona: "serenity" }, userMessage, opts);
}

export async function runNova(
  ctx: ChatRunContext,
  userMessage: string,
  opts: { onDelta?: (delta: string) => void } = {},
): Promise<NovaChatResult> {
  return runChat({ ...ctx, persona: "nova" }, userMessage, opts);
}

/** Used by the console's first paint so a fact can land before anyone talks. */
export async function seedNovaFact(
  organizationId: number,
  content: string,
  key: string,
): Promise<void> {
  await rememberNova(organizationId, { kind: "fact", key, content });
}

/**
 * Nova's chat loop, ported from RideBy.
 *
 * Same architecture as the original: a personality prompt, durable memory, a
 * fresh clock every request, streamed tokens, and up to four rounds of tool
 * calls before answering. Two things are different.
 *
 * First, no SDK. Sere talks to every API over plain fetch, so the OpenAI stream
 * is parsed here rather than imported. Second, everything is scoped to one
 * organization, because Sere is multi-tenant and RideBy is not.
 */

import { novaClockBlock } from "./clock";
import {
  loadNovaMemories,
  memoryBlock,
  recentNovaMessages,
  rememberNova,
  saveNovaMessage,
} from "./memory";
import { NOVA_TOOLS, runNovaTool, tradeWords, type ToolContext } from "./tools";

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
  return key.startsWith("sk-") ? key : null;
}

type Words = Awaited<ReturnType<typeof tradeWords>>;

/**
 * The personality, carried over from RideBy and pointed at a shop instead of a
 * lead pipeline. The refusals matter as much as the tone: an assistant that
 * agrees with everything is worth nothing to someone running a business.
 */
export function novaSystemPrompt(words: Words, ownerName: string, shopName: string): string {
  const unit = words.job.toLowerCase();
  const work = words.jobs.toLowerCase();
  return `You are Nova — the operating intelligence for ${shopName}, a ${words.trade.toLowerCase()} shop. Think Jarvis for ${ownerName}: shop co-pilot and the person who watches the money. Peer, not assistant.

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
- Sere's numbers are what the shop typed in. Processor numbers are what the bank saw. When they disagree, that gap is real information — say so rather than smoothing it over.

What you watch, unprompted:
- Work finished but never invoiced. That is money already earned and sitting there. Lead with it when it exists.
- Overdue invoices, oldest and largest first.
- ${words.jobs} with no date on them.
- Profit, not just revenue. Revenue with the costs ignored is a story, not a number.

What you do not do:
- You do not email ${words.customers.toLowerCase()} and you do not take payments. You can draft what to say and tell the owner where to send it.
- You do not invoice a ${unit}. Completing one is not billing it — say the owner still needs to finish and bill it.
- You never claim you did something a tool did not confirm.

When you act:
- Moving or completing a ${unit} is a real change to the board. Find it first, confirm exactly one match, then do it and say plainly what changed.
- If more than one ${unit} matches, ask which one. Do not guess.

Voice replies are usually 1 to 3 short sentences. Lead with the answer. No recap, no options menu, no "let me know if you need anything else" closer.

Talk to ${ownerName} like a sharp friend who happens to run the systems with him.`;
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

/**
 * One streamed round. Tokens are only forwarded when the round is going to end
 * as text — a round that turns into tool calls should not leak half a sentence
 * to the screen before Nova has the data.
 */
async function streamRound(
  apiKey: string,
  messages: ApiMessage[],
  onDelta?: (delta: string) => void,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  let response: Response;
  try {
    response = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NOVA_MODEL,
        temperature: 0.65,
        messages,
        tools: NOVA_TOOLS,
        tool_choice: "auto",
        stream: true,
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
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
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
  return { content: content.trim(), toolCalls };
}

export async function runNova(
  ctx: ToolContext & { ownerName: string; shopName: string },
  userMessage: string,
  opts: { onDelta?: (delta: string) => void } = {},
): Promise<NovaChatResult> {
  const apiKey = novaKey();
  if (!apiKey) throw new NovaError("Nova needs OPENAI_API_KEY on the server.");
  const trimmed = userMessage.trim();
  if (!trimmed) throw new NovaError("Empty message.");

  // The demo is a shared shop, so its chat is not persisted into anyone's
  // history and never teaches Nova anything.
  const persist = !ctx.isDemo;
  if (persist) await saveNovaMessage(ctx.organizationId, { role: "user", content: trimmed });

  const [words, memories, history] = await Promise.all([
    tradeWords(ctx.organizationId),
    persist ? loadNovaMemories(ctx.organizationId, 25) : Promise.resolve([]),
    persist ? recentNovaMessages(ctx.organizationId, 30) : Promise.resolve([]),
  ]);

  const messages: ApiMessage[] = [
    {
      role: "system",
      content: [
        novaSystemPrompt(words, ctx.ownerName, ctx.shopName),
        "",
        novaClockBlock(ctx.now),
        "",
        ctx.writable
          ? "You may move and complete work on this board."
          : "This shop is read-only right now (demo, or the trial ended). You can look and advise, but any change will be refused — say so plainly instead of pretending.",
        "",
        "What you have learned about this shop:",
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
    const { content, toolCalls } = await streamRound(apiKey, messages, opts.onDelta);
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
      const result = await runNovaTool(ctx, call.name, call.arguments || "{}");
      toolTrace.push({ name: call.name, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 12_000) });
      if (persist) {
        await saveNovaMessage(ctx.organizationId, {
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
  if (persist) await saveNovaMessage(ctx.organizationId, { role: "assistant", content: reply });
  return { reply, toolCalls: toolTrace };
}

/** Used by the console's first paint so Nova opens with something real. */
export async function seedNovaFact(
  organizationId: number,
  content: string,
  key: string,
): Promise<void> {
  await rememberNova(organizationId, { kind: "fact", key, content });
}

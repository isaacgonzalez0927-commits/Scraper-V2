/**
 * Nova's daily growth-management cycle.
 *
 * Deterministic execution policy + AI strategy notes. The model may recommend
 * a trade, but it cannot invent cities, send email, bypass caps, or spend outside
 * the configured lead-search budget. Decisions survive process restarts.
 *
 * This is deliberately separate from Serenity and from Nexus's work queue.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, nowISO } from "../db";
import { novaManagerRuns, novaMemory } from "../schema";
import { TRADE_QUERIES } from "../nexus/lead-filter";
import { enqueueJob, logAction } from "../nexus/jobs";
import { runTick } from "../nexus/runner";
import { loadOutreachState, type OutreachState } from "../nexus/state";
import { looksLikeOpenAIKey } from "../openai";
import { novaManagerEnabled } from "./manager-config";
export { novaManagerEnabled } from "./manager-config";
import { NOVA_MEMORY_ORG } from "./identity";

export const DEFAULT_NOVA_GOAL =
  "Find and convert qualified small trade businesses into paying Sere customers, " +
  "without damaging trust, deliverability, or the product's transactional email.";

export type ManagerAction = "work_queue" | "search_leads" | "observe";

export type ManagerPlan = {
  action: ManagerAction;
  city: string;
  trade: string;
  rationale: string;
  objective: string;
};

/** Semicolon-separated because city names can contain commas. Empty means NO Places spend. */
export function managerCities(): string[] {
  return [...new Set((process.env.NOVA_MANAGER_CITIES || "")
    .split(";").map((city) => city.trim()).filter(Boolean))]
    .slice(0, 12);
}

export function managerTrades(): string[] {
  const known = new Set(TRADE_QUERIES.map((row) => row.trade));
  const configured = (process.env.NOVA_MANAGER_TRADES || "hvac,plumbing,electrical")
    .split(",").map((trade) => trade.trim().toLowerCase()).filter((trade) => known.has(trade));
  return [...new Set(configured)].slice(0, 9);
}

export function managerDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return [get("year"), get("month"), get("day")].join("-");
}

export function chooseManagerPlan(input: {
  state: Pick<OutreachState, "queue" | "pipeline" | "learning">;
  cities: string[];
  trades: string[];
  previousCities: string[];
  objective: string;
}): ManagerPlan {
  const { state, cities, trades, previousCities, objective } = input;
  const activeTypes = ["lead.search", "research.company", "outreach.draft", "outreach.review"];
  const queuedWork = activeTypes.reduce((total, type) => total + (state.queue.byType[type] || 0), 0);
  if (queuedWork > 0 || state.pipeline.runway.ready > 0) {
    return {
      action: "work_queue", city: "", trade: "",
      rationale: "Finish qualified research and drafts before buying more lead searches.",
      objective,
    };
  }
  if (!cities.length || !trades.length) {
    return {
      action: "observe", city: "", trade: "",
      rationale: "No approved lead-search cities or trades configured. No paid discovery will run.",
      objective,
    };
  }

  // Rotate markets, rather than repeatedly paying to scrape the same one.
  const lastUsed = new Map<string, number>();
  previousCities.forEach((city, index) => {
    if (!lastUsed.has(city)) lastUsed.set(city, index);
  });
  const city = [...cities].sort((a, b) =>
    (lastUsed.get(b) ?? 999) - (lastUsed.get(a) ?? 999))[0];

  // A tiny sample is not proof of a winning trade. Experiment evenly until
  // there are at least 20 sends in a trade; then prefer actual reply signals.
  const stats = new Map(state.learning.byTrade.map((row) => [row.trade, row]));
  const trade = [...trades].sort((a, b) => {
    const sa = stats.get(a), sb = stats.get(b);
    const countA = sa?.sent || 0, countB = sb?.sent || 0;
    const rateA = countA >= 20 ? (sa?.replies || 0) / countA : -1;
    const rateB = countB >= 20 ? (sb?.replies || 0) / countB : -1;
    return rateB - rateA || countA - countB;
  })[0];

  return {
    action: "search_leads", city, trade, objective,
    rationale: "Qualified pipeline has no ready work. Test one permitted market and trade, then evaluate results.",
  };
}

async function managerGoal(): Promise<string> {
  const [row] = await db().select({ content: novaMemory.content })
    .from(novaMemory)
    .where(and(eq(novaMemory.organizationId, NOVA_MEMORY_ORG), eq(novaMemory.key, "manager.goal")))
    .limit(1);
  return row?.content || DEFAULT_NOVA_GOAL;
}

export async function setManagerGoal(goal: string): Promise<string> {
  const value = goal.trim().replace(/\s+/g, " ");
  if (value.length < 10 || value.length > 400) {
    throw new Error("Goal must contain 10–400 characters.");
  }
  const { rememberNova } = await import("./memory");
  await rememberNova(NOVA_MEMORY_ORG, { kind: "preference", key: "manager.goal", content: value });
  await logAction({ action: "manager.goal.updated", entityType: "goal", detail: value, actor: "operator" });
  return value;
}

type StrategicAdvice = { note: string; trade: string };

async function strategyAdvice(
  state: OutreachState,
  plan: ManagerPlan,
  trades: string[],
  goal: string,
): Promise<StrategicAdvice | null> {
  const rawKey = (process.env.NOVA_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const key = looksLikeOpenAIKey(rawKey) ? rawKey : null;
  if (!key || process.env.NOVA_MANAGER_AI_ENABLED === "false") return null;
  const model = process.env.NOVA_MANAGER_MODEL?.trim() || "gpt-4o-mini";
  try {
    const response = await fetch((process.env.OPENAI_API_BASE || "https://api.openai.com/v1") + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "You are Nova, Sere's skeptical growth manager. Analyze ONLY the supplied aggregate metrics. " +
            "No invented customer stories, market signals, numbers, or claims of actions completed. " +
            "Reply ONLY valid JSON: {\"note\":\"one practical recommendation (max 240 characters)\",\"trade\":\"one listed trade\"}. " +
            "Do not recommend more cold email volume without reply or signup evidence. " +
            "You may suggest a trade, but execution is controlled by a separate safety policy." },
          { role: "user", content: JSON.stringify({
            goal, proposedAction: plan.action, allowedTrades: trades,
            pipeline: state.pipeline, learning: state.learning,
            queued: state.queue.queued, failed: state.queue.failed,
            sending: { enabled: state.send.enabled, clearToSend: state.send.clearToSend },
          }) },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}") as {
      note?: unknown; trade?: unknown;
    };
    const note = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 240) : "";
    const trade = typeof parsed.trade === "string" && trades.includes(parsed.trade) ? parsed.trade : "";
    return note ? { note, trade } : null;
  } catch {
    return null; // Planner must still work if the AI provider is unavailable.
  }
}

export async function managerStatus() {
  const [runs, state, goal] = await Promise.all([
    db().select().from(novaManagerRuns).orderBy(desc(novaManagerRuns.day)).limit(7),
    loadOutreachState(), managerGoal(),
  ]);
  return {
    enabled: novaManagerEnabled(),
    goal,
    cities: managerCities(),
    trades: managerTrades(),
    runs,
    pipeline: {
      total: state.pipeline.total,
      ready: state.pipeline.runway.ready,
      queued: state.queue.queued,
      sent: state.learning.sent,
      replies: state.learning.replies,
      signups: state.learning.signups,
      approvalRequired: state.drafts.pendingApproval,
      sendEnabled: state.send.enabled,
    },
  };
}

export async function runManagerCycle(now: Date = new Date()) {
  const day = managerDay(now);
  if (!novaManagerEnabled()) return { status: "disabled", day, reason: "Set NOVA_MANAGER_ENABLED=true in staging after review." };
  // Unique day key: overlapping cron/manual calls cannot spend twice.
  const [claimed] = await db().insert(novaManagerRuns).values({
    day, status: "running", goal: DEFAULT_NOVA_GOAL, action: "observe",
    city: "", trade: "", rationale: "", outcome: "", createdAt: nowISO(), updatedAt: nowISO(),
  }).onConflictDoNothing().returning({ day: novaManagerRuns.day });
  if (!claimed) return { status: "already_run", day };

  try {
    const [state, goal, prior] = await Promise.all([
      loadOutreachState(),
      managerGoal(),
      db().select({ city: novaManagerRuns.city }).from(novaManagerRuns)
        .orderBy(desc(novaManagerRuns.day)).limit(25),
    ]);
    const cities = managerCities();
    const trades = managerTrades();
    const plan = chooseManagerPlan({
      state, cities, trades, objective: goal,
      previousCities: prior.map((row) => row.city).filter(Boolean),
    });
    const advice = await strategyAdvice(state, plan, trades, goal);
    const decision = {
      ...plan,
      trade: plan.action === "search_leads" && advice?.trade ? advice.trade : plan.trade,
      rationale: advice?.note ? plan.rationale + " Nova: " + advice.note : plan.rationale,
    };
    let outcome = "Reviewed growth position; no work queued.";
    if (decision.action === "search_leads") {
      const trade = TRADE_QUERIES.find((row) => row.trade === decision.trade);
      if (!trade || !cities.includes(decision.city)) throw new Error("Planner proposed a disallowed city or trade.");
      const query = trade.query + " in " + decision.city;
      const jobId = await enqueueJob("lead.search",
        { query, cityHint: decision.city, maxResults: 20 },
        { dedupeKey: "manager:" + day + ":search" });
      outcome = jobId ? "Queued one bounded Google Places lead search." : "Search already queued.";
    }
    // Reuse the existing guarded pipeline. One job keeps serverless execution bounded.
    if (decision.action !== "observe") {
      const tick = await runTick({ jobs: 1 });
      outcome += " Nexus processed " + tick.done + " job(s); " + tick.failed + " failed.";
    }
    await db().update(novaManagerRuns).set({
      status: "completed", goal, action: decision.action, city: decision.city,
      trade: decision.trade, rationale: decision.rationale, outcome, updatedAt: nowISO(),
    }).where(eq(novaManagerRuns.day, day));
    await logAction({
      action: "manager.cycle", entityType: "plan", entityId: day,
      detail: decision.action + " · " + decision.rationale.slice(0, 300), actor: "nova",
    });
    return { status: "completed", day, plan: decision, outcome };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown manager error";
    await db().update(novaManagerRuns).set({
      status: "failed", outcome: reason.slice(0, 500), updatedAt: nowISO(),
    }).where(eq(novaManagerRuns.day, day));
    return { status: "failed", day, error: reason };
  }
}

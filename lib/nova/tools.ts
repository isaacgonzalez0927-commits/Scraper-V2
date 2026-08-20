/**
 * Nova's hands.
 *
 * Ported from RideBy's Nova, where the tools are outreach hands (find_leads,
 * work, send_today). Sere's Nova runs a shop instead, so the hands are the
 * shop: read the board, read the money, move a job, close a job out.
 *
 * Two rules carried over from RideBy, both load-bearing:
 * - Nova never invents a number. Every figure comes from a tool.
 * - A write is a real database write through Sere's own logic, so a job Nova
 *   moves is indistinguishable from one the owner moved by hand.
 */

import { and, eq, ne } from "drizzle-orm";
import { tradeCopy } from "../business";
import { db, nowISO } from "../db";
import { displayName } from "../display";
import { logActivity } from "../finance";
import { parseWhen } from "../assistant";
import { customers, jobs, organizations } from "../schema";
import { shopAccess } from "../trial";
import { dossierHeadline, loadDossier, recentPayments } from "./dossier";
import { rememberNova } from "./memory";
import { enqueueJob } from "../nexus/jobs";
import { TRADE_QUERIES } from "../nexus/lead-filter";
import { isSendEnabled } from "../nexus/policy";
import { runTick } from "../nexus/runner";
import { loadOutreachState, recordDraftOutcome } from "../nexus/state";

export type ToolContext = {
  organizationId: number;
  isDemo: boolean;
  /** False when the trial has ended: Nova may look but not touch. */
  writable: boolean;
  now: Date;
};

export type NovaToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const NOVA_TOOLS: NovaToolDef[] = [
  {
    type: "function",
    function: {
      name: "shop",
      description:
        "The whole shop right now: money this month and week, outstanding and " +
        "overdue, profit and costs, live Stripe/Square cash, today's and " +
        "tomorrow's board, unscheduled work, work finished but never invoiced, " +
        "overdue and due-soon invoices, and who to follow up with. Call this " +
        "before answering anything about numbers or the schedule.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "payments",
      description: "The most recent payments actually recorded, newest first.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "How many, default 8, max 25" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_job",
      description:
        "Find jobs by title, customer name, or job id. Use before moving or " +
        "completing anything so you act on the right one.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Title words, customer name, or numeric id" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_job",
      description:
        "Reschedule one job. Say the date in plain words (tomorrow, Friday, " +
        "Friday at 2pm, 2026-08-25). Only call this when exactly one job matches.",
      parameters: {
        type: "object",
        properties: {
          job_id: { type: "number", description: "The job id from find_job" },
          when: { type: "string", description: "When to move it to" },
        },
        required: ["job_id", "when"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_job",
      description:
        "Mark one job complete. This does not invoice it — say that the owner " +
        "still needs to finish and bill it, and point at /jobs/<id>/finish.",
      parameters: {
        type: "object",
        properties: { job_id: { type: "number" } },
        required: ["job_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "outreach",
      description:
        "The state of Sere's own cold outreach: how many shops are in the " +
        "pipeline and at what stage, lead runway by city, drafts waiting on " +
        "review, whether sending is switched on and safe, today's cap and how " +
        "much is used, reply and signup rates by trade, which emails are " +
        "working, and the job queue. Call this before saying anything about " +
        "outreach numbers or whether mail actually went out.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_leads",
      description:
        "Queue a Google Places search for local shops in one city. Costs Places " +
        "quota, so one city and one trade at a time, and rotate cities rather " +
        "than re-scraping the same one.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: 'City, e.g. "Fort Myers FL"' },
          trade: {
            type: "string",
            description: `One of: ${TRADE_QUERIES.map((t) => t.trade).join(", ")}`,
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "work",
      description:
        "Run the pipeline forward one tick: research shops, write drafts, review " +
        "them, and queue whatever is clear to send. Returns immediately with what " +
        "it did. Costs model calls, so do not loop on it.",
      parameters: {
        type: "object",
        properties: {
          jobs: { type: "number", description: "How many jobs this tick, default 4, max 12" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "outcome",
      description:
        "Record what came back from a cold email, by the address it went to. " +
        "This is the only thing that teaches the drafting hand anything.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          kind: { type: "string", enum: ["replied", "demo", "signup", "bounced", "complained"] },
        },
        required: ["email", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Save something durable: a lesson about this shop, or a preference the " +
        "owner stated. Use a stable key so it updates instead of duplicating. " +
        "Do not store passing chat as gospel.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["note", "lesson", "preference", "fact"] },
          key: { type: "string", description: "Stable key, e.g. pricing.ac_replacement" },
          content: { type: "string" },
        },
        required: ["kind", "content"],
      },
    },
  },
];

export async function runNovaTool(
  ctx: ToolContext,
  name: string,
  argsJson: string,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case "shop":
    case "status":
    case "business": {
      const dossier = await loadDossier(ctx.organizationId, ctx.isDemo, ctx.now);
      return JSON.stringify({ ...dossier, headline: dossierHeadline(dossier) });
    }

    case "payments": {
      const raw = Number(args.limit);
      const limit = Number.isFinite(raw) ? Math.min(25, Math.max(1, raw)) : 8;
      return JSON.stringify({ payments: await recentPayments(ctx.organizationId, limit) });
    }

    case "find_job":
      return JSON.stringify({ jobs: await findJobs(ctx, String(args.query || "")) });

    case "move_job":
      return JSON.stringify(await moveJob(ctx, Number(args.job_id), String(args.when || "")));

    case "complete_job":
      return JSON.stringify(await completeJob(ctx, Number(args.job_id)));

    case "outreach":
      return JSON.stringify(await loadOutreachState());

    case "find_leads": {
      const city = String(args.city || "").trim();
      if (!city) return JSON.stringify({ ok: false, error: "Which city?" });
      const tradeKey = String(args.trade || "").trim().toLowerCase();
      const entry = TRADE_QUERIES.find((t) => t.trade === tradeKey) || TRADE_QUERIES[0];
      const query = `${entry.query} in ${city}`;
      const id = await enqueueJob(
        "lead.search",
        { query, cityHint: city, maxResults: 20 },
        { dedupeKey: `search:${query.toLowerCase()}` },
      );
      return JSON.stringify({
        ok: true,
        queued: Boolean(id),
        query,
        trade: entry.trade,
        note: id
          ? "Queued. Run work to process it."
          : "That exact search is already queued or running.",
      });
    }

    case "work": {
      const raw = Number(args.jobs);
      const jobs = Number.isFinite(raw) ? Math.min(12, Math.max(1, raw)) : 4;
      const tick = await runTick({ jobs });
      return JSON.stringify({
        ...tick,
        sendEnabled: isSendEnabled(),
        note: isSendEnabled()
          ? "Sending is armed."
          : "NEXUS_SEND_ENABLED is not true, so nothing transmits. Drafting and queueing only — do not claim mail went out.",
      });
    }

    case "outcome": {
      const email = String(args.email || "").trim();
      const kind = String(args.kind || "") as
        | "replied"
        | "demo"
        | "signup"
        | "bounced"
        | "complained";
      if (!email || !kind) return JSON.stringify({ ok: false, error: "Need an email and a kind." });
      const done = await recordDraftOutcome(email, kind);
      return JSON.stringify({
        ok: done,
        error: done ? undefined : `No sent email found for ${email}.`,
      });
    }

    case "remember": {
      const content = String(args.content || "").trim();
      if (!content) return JSON.stringify({ ok: false, error: "Nothing to remember." });
      await rememberNova(ctx.organizationId, {
        kind: (String(args.kind || "note") as "note" | "lesson" | "preference" | "fact"),
        key: String(args.key || ""),
        content,
      });
      return JSON.stringify({ ok: true, remembered: content });
    }

    default:
      return JSON.stringify({ error: `No tool named ${name}.` });
  }
}

type JobHit = {
  id: number;
  title: string;
  customer: string;
  when: string;
  status: string;
};

async function findJobs(ctx: ToolContext, query: string): Promise<JobHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.organizationId, ctx.organizationId), ne(jobs.status, "cancelled")));

  const packed = rows.map((row) => ({
    id: row.job.id,
    title: row.job.title,
    customer: displayName(row.customer),
    when: row.job.scheduledStart || "unscheduled",
    status: row.job.status,
    hay: `${row.job.title} ${displayName(row.customer)} ${row.customer.name} ${row.customer.companyName}`.toLowerCase(),
  }));

  if (/^\d+$/.test(q)) {
    return packed.filter((row) => row.id === Number(q)).map(strip);
  }
  const words = q.split(/\s+/).filter(Boolean);
  return packed
    .filter((row) => words.every((word) => row.hay.includes(word)))
    .slice(0, 8)
    .map(strip);
}

function strip(row: JobHit & { hay?: string }): JobHit {
  return { id: row.id, title: row.title, customer: row.customer, when: row.when, status: row.status };
}

/** Shared gate so no write path forgets the demo and trial rules. */
async function guardWrite(ctx: ToolContext): Promise<string | null> {
  if (ctx.isDemo) {
    return "This is the Harbor Air demo. Nothing here saves. Tell the owner to create their own shop first.";
  }
  if (!ctx.writable) {
    const [org] = await db()
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId));
    const access = shopAccess(
      { plan: org?.plan || "trial", trialEndsAt: org?.trialEndsAt || "" },
      false,
      ctx.now,
    );
    return access.block;
  }
  return null;
}

async function moveJob(
  ctx: ToolContext,
  jobId: number,
  when: string,
): Promise<Record<string, unknown>> {
  const blocked = await guardWrite(ctx);
  if (blocked) return { ok: false, error: blocked };
  if (!Number.isFinite(jobId)) return { ok: false, error: "No job id." };

  const stamp = parseWhen(when, ctx.now);
  if (!stamp) {
    return { ok: false, error: `Could not read "${when}" as a date. Ask the owner for a day.` };
  }
  const [row] = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.organizationId)));
  if (!row) return { ok: false, error: "No job with that id in this shop." };

  await db()
    .update(jobs)
    .set({ scheduledStart: stamp, status: "scheduled" })
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.organizationId)));
  await logActivity(
    ctx.organizationId,
    "job_rescheduled",
    `Nova moved ${row.job.title}`,
    null,
    `/jobs/${jobId}`,
  );
  return {
    ok: true,
    moved: row.job.title,
    customer: displayName(row.customer),
    to: stamp,
    href: `/jobs/${jobId}`,
  };
}

async function completeJob(ctx: ToolContext, jobId: number): Promise<Record<string, unknown>> {
  const blocked = await guardWrite(ctx);
  if (blocked) return { ok: false, error: blocked };
  if (!Number.isFinite(jobId)) return { ok: false, error: "No job id." };

  const [row] = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.organizationId)));
  if (!row) return { ok: false, error: "No job with that id in this shop." };

  await db()
    .update(jobs)
    .set({ status: "completed", completedAt: nowISO() })
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.organizationId)));
  await logActivity(
    ctx.organizationId,
    "job_completed",
    `Nova completed ${row.job.title}`,
    null,
    `/jobs/${jobId}`,
  );
  return {
    ok: true,
    completed: row.job.title,
    customer: displayName(row.customer),
    note: "Not invoiced yet. The owner finishes and bills it.",
    href: `/jobs/${jobId}/finish`,
  };
}

/** Trade words for the system prompt, so Nova says "calls" to a plumber. */
export async function tradeWords(organizationId: number): Promise<{
  trade: string;
  job: string;
  jobs: string;
  customer: string;
  customers: string;
  worker: string;
}> {
  const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
  const voice = tradeCopy(org?.businessType);
  return {
    trade: voice.name,
    job: voice.job,
    jobs: voice.jobs,
    customer: voice.customer,
    customers: voice.customers,
    worker: voice.worker,
  };
}

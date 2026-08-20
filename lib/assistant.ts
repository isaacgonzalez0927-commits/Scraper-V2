import { and, desc, eq, ne } from "drizzle-orm";
import { countLabel, tradeCopy } from "./business";
import { db } from "./db";
import { displayName } from "./display";
import { logActivity } from "./finance";
import { prettyDate, prettyWhen } from "./labels";
import { formatMoney } from "./money";
import { collectedCents, isoDate, outstandingTotals, weekBounds } from "./queries";
import { customers, invoices, jobs, organizations } from "./schema";
import { integrationStatus, openaiConfig } from "./integrations";
import { completeShopJson, DEFAULT_OPENAI_MODEL, type OpenAIChatJson } from "./openai";
import { loadOwnerIntelligence } from "./owner-intelligence";
import { loadStripeCash } from "./stripe-cash";
import { loadSquareCash } from "./square-cash";

export type AssistantLink = { href: string; label: string };

export type AssistantAlert = {
  tone: "bad" | "warn" | "info" | "good";
  title: string;
  body: string;
  href: string;
};

export type AssistantBrief = {
  greeting: string;
  summary: string;
  alerts: AssistantAlert[];
  suggestions: string[];
  /** True when this shop has its own OpenAI key connected. */
  gpt: boolean;
};

export type AssistantReply = {
  text: string;
  links: AssistantLink[];
  did?: string;
};

type RescheduleIntent = { kind: "reschedule"; query: string; when: string };
type CompleteIntent = { kind: "complete"; query: string };
type JobsIntent = { kind: "jobs"; when: "today" | "tomorrow" | "week" | "unscheduled" };
type InvoicesIntent = { kind: "invoices"; filter: "overdue" | "unpaid" | "draft" | "due_soon" };
type AnswerIntent = { kind: "answer"; text: string };
type BriefIntent = { kind: "brief" };
type CashIntent = { kind: "cash" };
type HelpIntent = { kind: "help" };
type UnknownIntent = { kind: "unknown" };

export type AssistantIntent =
  | RescheduleIntent
  | CompleteIntent
  | JobsIntent
  | InvoicesIntent
  | BriefIntent
  | CashIntent
  | HelpIntent
  | AnswerIntent
  | UnknownIntent;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local-naive datetime, matching datetime-local inputs in the job form. */
export function stampAt(date: Date, hours: number, minutes: number): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}:00`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/**
 * Turns "friday", "tomorrow", "aug 21", "2026-08-21" into a 9:00 stamp.
 * Hours stay 9:00 unless the phrase includes a time.
 */
export function parseWhen(text: string, now = new Date()): string | null {
  let raw = text.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  raw = raw.replace(/^(on|for|to|until|by)\s+/, "");

  let hours = 9;
  let minutes = 0;
  const time = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (time) {
    hours = Number(time[1]);
    minutes = Number(time[2] || 0);
    if (time[3] === "pm" && hours < 12) hours += 12;
    if (time[3] === "am" && hours === 12) hours = 0;
    raw = raw.replace(time[0], " ").replace(/\bat\b/g, " ").replace(/\s+/g, " ").trim();
  }

  const today = startOfDay(now);
  if (raw === "today" || raw === "this morning") return stampAt(today, hours, minutes);
  if (raw === "tonight") return stampAt(today, 18, 0);
  if (raw === "tomorrow") return stampAt(addDays(today, 1), hours, minutes);
  if (raw === "yesterday") return stampAt(addDays(today, -1), hours, minutes);

  const inDays = raw.match(/^in (\d+) days?$/);
  if (inDays) return stampAt(addDays(today, Number(inDays[1])), hours, minutes);

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return stampAt(d, hours, minutes);
  }
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (us) {
    const year = us[3] ? Number(us[3].length === 2 ? `20${us[3]}` : us[3]) : today.getFullYear();
    const d = new Date(year, Number(us[1]) - 1, Number(us[2]));
    return stampAt(d, hours, minutes);
  }

  const named = raw.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (named) {
    const months: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
      september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
    };
    const month = months[named[1]];
    const d = new Date(today.getFullYear(), month, Number(named[2]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return stampAt(d, hours, minutes);
  }

  const nextWeek = raw.startsWith("next ");
  const dayName = raw.replace(/^next\s+/, "");
  const weekday = WEEKDAYS.indexOf(dayName);
  if (weekday >= 0) {
    let delta = (weekday - today.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (nextWeek && delta < 7) delta += 7;
    return stampAt(addDays(today, delta), hours, minutes);
  }
  return null;
}

function cleanJobQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(the|job|appointment|visit|work order|workorder|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAssistant(message: string, now = new Date()): AssistantIntent {
  const text = message.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (!lower) return { kind: "brief" };

  if (
    /^(hi|hello|hey|help|what can you do|what do you do)\b/.test(lower) ||
    lower.includes("what can you")
  ) {
    return { kind: "help" };
  }

  if (/\b(overdue|past due|late invoices?)\b/.test(lower)) {
    return { kind: "invoices", filter: "overdue" };
  }
  if (/\b(due soon|coming due|due this week)\b/.test(lower)) {
    return { kind: "invoices", filter: "due_soon" };
  }
  if (/\b(unpaid|outstanding invoices?|who owes|still owe)\b/.test(lower)) {
    return { kind: "invoices", filter: "unpaid" };
  }
  if (/\bdraft invoices?\b/.test(lower)) return { kind: "invoices", filter: "draft" };

  if (/\b(cash|collected|money in|what came in|revenue)\b/.test(lower)) {
    return { kind: "cash" };
  }

  const complete = lower.match(
    /^(?:mark|set)?\s*(?:the\s+)?(.+?)\s+(?:as\s+)?(?:complete|completed|done|finished)$/,
  ) || lower.match(/^(?:complete|finish|close)\s+(?:the\s+)?(.+)$/);
  if (complete) return { kind: "complete", query: cleanJobQuery(complete[1]) };

  const move = lower.match(
    /^(?:move|reschedule|change|push|put|schedule|set)\s+(?:the\s+date\s+(?:of|for)\s+)?(?:the\s+)?(.+?)\s+(?:to|on|for)\s+(.+)$/,
  );
  if (move) {
    const when = parseWhen(move[2], now);
    if (when) return { kind: "reschedule", query: cleanJobQuery(move[1]), when };
  }

  const changeDate = lower.match(
    /^(?:change|update)\s+(?:the\s+)?date\s+(?:of|for)\s+(?:the\s+)?(.+?)\s+(?:to|on|for)\s+(.+)$/,
  );
  if (changeDate) {
    const when = parseWhen(changeDate[2], now);
    if (when) return { kind: "reschedule", query: cleanJobQuery(changeDate[1]), when };
  }

  if (/\bunscheduled\b/.test(lower) || /\bnot scheduled\b/.test(lower)) {
    return { kind: "jobs", when: "unscheduled" };
  }
  if (/\bthis week\b/.test(lower) || /\bweek's jobs\b/.test(lower)) {
    return { kind: "jobs", when: "week" };
  }
  if (
    (/\btomorrow\b/.test(lower) && /\b(jobs?|calendar|schedule|board)\b/.test(lower)) ||
    lower === "tomorrow" ||
    lower === "what's on tomorrow" ||
    lower === "whats on tomorrow"
  ) {
    return { kind: "jobs", when: "tomorrow" };
  }
  if (
    /\b(jobs? today|today's jobs?|on the board|what's on|what is on|calendar today)\b/.test(lower) ||
    lower === "today"
  ) {
    return { kind: "jobs", when: "today" };
  }

  if (
    /^(brief|overview|how are we|how am i|catch me up|summary|status)/.test(lower) ||
    lower.includes("need me") ||
    lower.includes("waiting on me") ||
    lower.includes("catch me up") ||
    /\b(what's wrong|what needs attention|alerts?)\b/.test(lower)
  ) {
    return { kind: "brief" };
  }

  return { kind: "unknown" };
}

/**
 * Maps a JSON plan from the shop's OpenAI model onto a known Sere intent.
 * Completing or rescheduling still goes through findJobs + SQL in this file.
 */
export function planToIntent(plan: OpenAIChatJson, now = new Date()): AssistantIntent {
  const intent = String(plan.intent || "").toLowerCase().trim();
  const reply = String(plan.reply || "").trim();
  if (intent === "help") return { kind: "help" };
  if (intent === "brief") return { kind: "brief" };
  if (intent === "cash") return { kind: "cash" };
  if (intent === "jobs") {
    const when =
      plan.when === "tomorrow" || plan.when === "week" || plan.when === "unscheduled"
        ? plan.when
        : "today";
    return { kind: "jobs", when };
  }
  if (intent === "invoices") {
    const filter =
      plan.filter === "overdue" || plan.filter === "draft" || plan.filter === "due_soon"
        ? plan.filter
        : "unpaid";
    return { kind: "invoices", filter };
  }
  if (intent === "complete" && plan.query) {
    return { kind: "complete", query: cleanJobQuery(String(plan.query)) };
  }
  if (intent === "reschedule" && plan.query) {
    const when = parseWhen(String(plan.date || ""), now);
    if (when) return { kind: "reschedule", query: cleanJobQuery(String(plan.query)), when };
  }
  if (intent === "answer" && reply) return { kind: "answer", text: reply };
  if (reply) return { kind: "answer", text: reply };
  return { kind: "unknown" };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function hourGreeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export async function buildBrief(
  organizationId: number,
  userName: string,
  businessType: string,
  now = new Date(),
): Promise<AssistantBrief> {
  const voice = tradeCopy(businessType);
  const today = isoDate(now);
  const week = weekBounds(now);
  const [{ outstanding, overdue }, integrations, jobRows, invoiceRows, collected] = await Promise.all([
    outstandingTotals(organizationId),
    integrationStatus(organizationId),
    db().select().from(jobs).where(eq(jobs.organizationId, organizationId)),
    db().select().from(invoices).where(eq(invoices.organizationId, organizationId)),
    collectedCents(organizationId, week.start, week.end),
  ]);

  const jobsToday = jobRows.filter((j) => j.scheduledStart?.slice(0, 10) === today && j.status !== "cancelled");
  const tomorrow = isoDate(addDays(now, 1));
  const jobsTomorrow = jobRows.filter(
    (j) => j.scheduledStart?.slice(0, 10) === tomorrow && j.status !== "cancelled",
  );
  const unscheduled = jobRows.filter((j) => !j.scheduledStart && j.status !== "cancelled" && j.status !== "completed");
  const drafts = invoiceRows.filter((i) => i.status === "draft");
  const overdueInvoices = invoiceRows.filter((i) => i.status === "overdue");
  const until = isoDate(addDays(now, 3));
  const dueSoon = invoiceRows.filter((i) => {
    if (!["sent", "viewed", "partial"].includes(i.status)) return false;
    const due = i.dueDate?.slice(0, 10) || "";
    return due >= today && due <= until;
  });

  const alerts: AssistantAlert[] = [];
  if (overdue > 0) {
    alerts.push({
      tone: "bad",
      title: `${formatMoney(overdue)} overdue`,
      body: overdueInvoices.length === 1
        ? `${overdueInvoices[0].number} is past due.`
        : `${overdueInvoices.length} invoices are past the due date.`,
      href: "/invoices?status=overdue",
    });
  }
  if (dueSoon.length) {
    alerts.push({
      tone: "warn",
      title: `${dueSoon.length} due in 3 days`,
      body: dueSoon.slice(0, 3).map((i) => i.number).join(", "),
      href: "/invoices",
    });
  }
  if (jobsToday.length) {
    alerts.push({
      tone: "info",
      title: `${countLabel(jobsToday.length, voice.job, voice.jobs)} today`,
      body: jobsToday.slice(0, 3).map((j) => j.title).join(", "),
      href: "/calendar",
    });
  } else if (jobsTomorrow.length) {
    alerts.push({
      tone: "info",
      title: `${countLabel(jobsTomorrow.length, voice.job, voice.jobs)} tomorrow`,
      body: jobsTomorrow.slice(0, 3).map((j) => j.title).join(", "),
      href: "/calendar",
    });
  }
  if (unscheduled.length) {
    alerts.push({
      tone: "warn",
      title: `${unscheduled.length} unscheduled`,
      body: `Ask me to move one onto a day, or open ${voice.jobs}.`,
      href: "/jobs?status=unscheduled",
    });
  }
  if (drafts.length) {
    alerts.push({
      tone: "warn",
      title: `${drafts.length} draft ${drafts.length === 1 ? "invoice" : "invoices"}`,
      body: "Still sitting, not sent.",
      href: "/invoices?status=draft",
    });
  }
  if (!integrations.stripe.connected && !integrations.square.connected) {
    alerts.push({
      tone: "info",
      title: "Processor cash is off",
      body: "Connect Stripe or Square to see the real cash, not just logged invoices.",
      href: "/settings?tab=integrations",
    });
  }

  const bits: string[] = [];
  if (jobsToday.length) bits.push(`${jobsToday.length} on the board today`);
  else if (jobsTomorrow.length) bits.push(`${jobsTomorrow.length} tomorrow, nothing today`);
  else bits.push("nothing scheduled today");
  if (overdue > 0) bits.push(`${formatMoney(overdue)} overdue`);
  else bits.push("nothing overdue");
  bits.push(`${formatMoney(collected)} collected this week`);

  return {
    greeting: `${hourGreeting(now)}, ${firstName(userName)}`,
    summary: `${voice.name}. ${bits.join(". ")}.`,
    alerts,
    suggestions: [
      jobsToday.length
        ? "What's on today"
        : jobsTomorrow.length
          ? "What's on tomorrow"
          : voice.suggestions[0],
      overdue > 0 ? "Show overdue invoices" : dueSoon.length ? "What's due soon" : voice.suggestions[1],
      unscheduled[0] ? `Move ${unscheduled[0].title} to tomorrow` : voice.suggestions[2],
    ].slice(0, 3),
    gpt: integrations.openai.connected,
  };
}

type JobHit = { id: number; title: string; scheduledStart: string | null; customer: string };

async function findJobs(organizationId: number, query: string): Promise<JobHit[]> {
  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.organizationId, organizationId), ne(jobs.status, "cancelled")));
  const q = query.trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    return rows
      .filter((r) => r.job.id === Number(q))
      .map((r) => ({
        id: r.job.id,
        title: r.job.title,
        scheduledStart: r.job.scheduledStart,
        customer: displayName(r.customer),
      }));
  }
  return rows
    .filter((r) => {
      const hay = `${r.job.title} ${displayName(r.customer)} ${r.customer.name} ${r.customer.companyName}`.toLowerCase();
      return q.split(" ").every((word) => hay.includes(word));
    })
    .map((r) => ({
      id: r.job.id,
      title: r.job.title,
      scheduledStart: r.job.scheduledStart,
      customer: displayName(r.customer),
    }));
}

function jobLinks(hits: JobHit[]): AssistantLink[] {
  return hits.slice(0, 6).map((job) => ({
    href: `/jobs/${job.id}`,
    label: `${job.title} · ${job.customer}`,
  }));
}

type SnapshotJob = { id: number; title: string; customer: string; when: string; status: string };
type SnapshotInvoice = { number: string; due: string; amount: string; status: string };

async function shopSnapshot(
  organizationId: number,
  now: Date,
): Promise<{ shop: string; today: string; snapshot: string }> {
  const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
  const shop = org?.name || "your shop";
  const today = isoDate(now);
  const tomorrow = isoDate(addDays(now, 1));
  const until = isoDate(addDays(now, 3));
  const week = weekBounds(now);
  const [jobRows, invoiceRows, collected, stripeCash, squareCash, owner] = await Promise.all([
    db()
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(and(eq(jobs.organizationId, organizationId), ne(jobs.status, "cancelled"))),
    db().select().from(invoices).where(eq(invoices.organizationId, organizationId)),
    collectedCents(organizationId, week.start, week.end),
    loadStripeCash(organizationId, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, today),
    loadSquareCash(organizationId, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, today),
    loadOwnerIntelligence(organizationId, now),
  ]);

  function packJob(row: { job: typeof jobs.$inferSelect; customer: typeof customers.$inferSelect }): SnapshotJob {
    return {
      id: row.job.id,
      title: row.job.title,
      customer: displayName(row.customer),
      when: prettyWhen(row.job.scheduledStart) || "unscheduled",
      status: row.job.status,
    };
  }

  function packInvoice(row: typeof invoices.$inferSelect): SnapshotInvoice {
    return {
      number: row.number,
      due: prettyDate(row.dueDate),
      amount: formatMoney(row.totalCents),
      status: row.status,
    };
  }

  const data = {
    shop,
    today,
    tomorrow,
    collectedThisWeek: formatMoney(collected),
    jobsToday: jobRows.filter((r) => r.job.scheduledStart?.slice(0, 10) === today).slice(0, 8).map(packJob),
    jobsTomorrow: jobRows.filter((r) => r.job.scheduledStart?.slice(0, 10) === tomorrow).slice(0, 8).map(packJob),
    unscheduled: jobRows
      .filter((r) => !r.job.scheduledStart && r.job.status !== "completed")
      .slice(0, 8)
      .map(packJob),
    overdueInvoices: invoiceRows.filter((i) => i.status === "overdue").slice(0, 8).map(packInvoice),
    dueSoon: invoiceRows
      .filter((i) => {
        if (!["sent", "viewed", "partial"].includes(i.status)) return false;
        const due = i.dueDate?.slice(0, 10) || "";
        return due >= today && due <= until;
      })
      .slice(0, 8)
      .map(packInvoice),
    stripe: stripeCash.connected && !stripeCash.error
      ? { available: formatMoney(stripeCash.availableCents), pending: formatMoney(stripeCash.pendingCents) }
      : null,
    square: squareCash.connected && !squareCash.error
      ? { takenThisMonth: formatMoney(squareCash.monthInCents) }
      : null,
    owner: {
      collectedThisMonth: formatMoney(owner.collectedThisMonthCents),
      tracedToJobs: formatMoney(owner.mappedToJobsCents),
      unassigned: formatMoney(owner.unmappedCents),
      profitOnTracedJobs: formatMoney(owner.mappedJobProfitCents),
      cashTrendPercent: owner.trendPercent,
      overdue: formatMoney(owner.overdueCents),
      paymentTrails: owner.trails.slice(0, 6).map((row) => ({
        amount: formatMoney(row.amountCents),
        source: row.source,
        customer: row.customerName,
        invoice: row.invoiceNumber || null,
        job: row.jobTitle || null,
        jobRevenue: row.jobId ? formatMoney(row.jobRevenueCents) : null,
        jobCosts: row.jobId ? formatMoney(row.jobCostCents) : null,
        jobProfit: row.jobId ? formatMoney(row.jobProfitCents) : null,
      })),
      followUpToday: owner.followUps
        .filter((row) => !row.remindedToday)
        .slice(0, 5)
        .map((row) => ({
          customer: row.customerName,
          invoice: row.invoiceNumber,
          balance: formatMoney(row.balanceCents),
          daysOverdue: row.daysOverdue,
        })),
    },
  };
  return { shop, today, snapshot: JSON.stringify(data) };
}

async function askOpenAIForIntent(
  organizationId: number,
  message: string,
  now: Date,
): Promise<AssistantIntent | null> {
  const config = await openaiConfig(organizationId);
  if (!config) return null;
  try {
    const { shop, snapshot } = await shopSnapshot(organizationId, now);
    const plan = await completeShopJson(
      config.apiKey,
      config.model || DEFAULT_OPENAI_MODEL,
      [
        `You are Nova, Sere's owner assistant for ${shop}.`,
        "Use only the JSON snapshot. Never invent customers, jobs, invoices, or amounts.",
        "You cannot send email, take card payments, or write to the database.",
        "If they want to complete or reschedule a job, set intent to complete or reschedule",
        "with query (title or job id) and date (e.g. Friday, tomorrow, 2026-08-21).",
        "If they ask a question, set intent to answer and a short reply from the snapshot.",
        "JSON keys: intent, when, filter, query, date, reply.",
        "intent is one of: jobs, invoices, cash, brief, complete, reschedule, help, answer.",
        "when is today, tomorrow, week, or unscheduled. filter is overdue, unpaid, draft, or due_soon.",
      ].join(" "),
      `Snapshot:\n${snapshot}\n\nOwner said:\n${message}`,
    );
    return planToIntent(plan, now);
  } catch {
    return null;
  }
}

export async function runAssistant(
  organizationId: number,
  userName: string,
  businessType: string,
  message: string,
  now = new Date(),
): Promise<AssistantReply> {
  let intent = parseAssistant(message, now);
  if (intent.kind === "unknown") {
    const mapped = await askOpenAIForIntent(organizationId, message, now);
    if (mapped) intent = mapped;
  }

  const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
  const shop = org?.name || "your shop";
  const voice = tradeCopy(businessType || org?.businessType);

  if (intent.kind === "answer") {
    return { text: intent.text, links: [] };
  }

  if (intent.kind === "help" || intent.kind === "unknown") {
    const gpt = Boolean(await openaiConfig(organizationId));
    const work = voice.jobs.toLowerCase();
    const unit = voice.job.toLowerCase();
    return {
      text:
        intent.kind === "unknown"
          ? gpt
            ? `I did not catch that. Try today's ${work}, overdue invoices, or move a ${unit} to Friday.`
            : [
                `I did not catch that. I can show today's ${work}, catch you up,`,
                `list overdue invoices, or move a ${unit}. Connect an OpenAI key`,
                `in Settings if you want me to answer in plain English.`,
                `Try: move the next ${unit} to Friday.`,
              ].join(" ")
          : [
              `I watch ${shop} for you. Ask for today's ${work}, overdue invoices,`,
              `or cash this week. Or say move the next ${unit} to Friday.`,
            ].join(" "),
      links:
        intent.kind === "unknown" && !gpt
          ? [{ href: "/settings?tab=integrations#openai", label: "Connect OpenAI" }]
          : [],
    };
  }

  if (intent.kind === "brief") {
    const brief = await buildBrief(organizationId, userName, businessType, now);
    const lines = brief.alerts.length
      ? brief.alerts.map((a) => `• ${a.title}: ${a.body}`).join("\n")
      : "Nothing needs you right now.";
    return {
      text: `${brief.greeting}. ${brief.summary}\n${lines}`,
      links: brief.alerts.map((a) => ({ href: a.href, label: a.title })),
    };
  }

  if (intent.kind === "cash") {
    const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const today = isoDate(now);
    const [monthIn, weekIn, totals, stripeCash, squareCash] = await Promise.all([
      collectedCents(organizationId, monthStart, today),
      collectedCents(organizationId, weekBounds(now).start, weekBounds(now).end),
      outstandingTotals(organizationId),
      loadStripeCash(organizationId, monthStart, today),
      loadSquareCash(organizationId, monthStart, today),
    ]);
    let text =
      `This week ${formatMoney(weekIn)} came in on the Sere ledger. This month ` +
      `${formatMoney(monthIn)}. Outstanding ${formatMoney(totals.outstanding)}, overdue ` +
      `${formatMoney(totals.overdue)}.`;
    if (stripeCash.connected && !stripeCash.error) {
      text +=
        ` Stripe has ${formatMoney(stripeCash.availableCents)} available now` +
        (stripeCash.pendingCents
          ? ` and ${formatMoney(stripeCash.pendingCents)} pending`
          : "") +
        `. Charged this month ${formatMoney(stripeCash.monthInCents)}.`;
    }
    if (squareCash.connected && !squareCash.error) {
      text +=
        ` Square took ${formatMoney(squareCash.monthInCents)} this month` +
        (squareCash.inTransitCents
          ? `, ${formatMoney(squareCash.inTransitCents)} in transit`
          : "") +
        ".";
    }
    if (!stripeCash.connected && !squareCash.connected) {
      text += " Connect Stripe or Square in Settings to see live cash next to this.";
    }
    return {
      text,
      links: [
        { href: "/reports", label: "Cash and profit" },
        { href: "/overview", label: "Overview" },
        { href: "/payments", label: "Payments" },
      ],
    };
  }

  if (intent.kind === "invoices") {
    const rows = await db()
      .select()
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId))
      .orderBy(desc(invoices.issueDate));
    const filtered = rows.filter((row) => {
      if (intent.filter === "overdue") return row.status === "overdue";
      if (intent.filter === "draft") return row.status === "draft";
      if (intent.filter === "due_soon") {
        const today = isoDate(now);
        const until = isoDate(addDays(now, 3));
        const due = row.dueDate?.slice(0, 10) || "";
        return ["sent", "viewed", "partial"].includes(row.status) && due >= today && due <= until;
      }
      return ["sent", "viewed", "partial", "overdue"].includes(row.status);
    });
    if (!filtered.length) {
      return { text: `No ${intent.filter} invoices.`, links: [{ href: "/invoices", label: "Invoices" }] };
    }
    const lines = filtered.slice(0, 8).map((row) => `${row.number} · ${prettyDate(row.dueDate)} · ${formatMoney(row.totalCents)}`);
    return {
      text: `${filtered.length} ${intent.filter} ${filtered.length === 1 ? "invoice" : "invoices"}.\n${lines.join("\n")}`,
      links: filtered.slice(0, 6).map((row) => ({ href: `/invoices/${row.id}`, label: row.number })),
    };
  }

  if (intent.kind === "jobs") {
    const rows = await db()
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(and(eq(jobs.organizationId, organizationId), ne(jobs.status, "cancelled")));
    const today = isoDate(now);
    const tomorrow = isoDate(addDays(now, 1));
    const week = weekBounds(now);
    const filtered = rows.filter(({ job }) => {
      const day = job.scheduledStart?.slice(0, 10) || "";
      if (intent.when === "unscheduled") return !job.scheduledStart && job.status !== "completed";
      if (intent.when === "today") return day === today;
      if (intent.when === "tomorrow") return day === tomorrow;
      return day >= week.start && day <= week.end;
    });
    if (!filtered.length) {
      return {
        text: `Nothing ${intent.when === "unscheduled" ? "waiting to be scheduled" : `on ${intent.when}`}.`,
        links: [{ href: "/jobs", label: voice.jobs }],
      };
    }
    const lines = filtered.slice(0, 8).map(({ job, customer }) => {
      const when = prettyWhen(job.scheduledStart) || "unscheduled";
      return `${job.title} · ${displayName(customer)} · ${when}`;
    });
    return {
      text: `${countLabel(filtered.length, voice.job, voice.jobs)}.\n${lines.join("\n")}`,
      links: filtered.slice(0, 6).map(({ job, customer }) => ({
        href: `/jobs/${job.id}`,
        label: `${job.title} · ${displayName(customer)}`,
      })),
    };
  }

  if (intent.kind === "complete") {
    const hits = await findJobs(organizationId, intent.query);
    if (!hits.length) {
      return {
        text: `I could not find a ${voice.job.toLowerCase()} matching "${intent.query}".`,
        links: [{ href: "/jobs", label: voice.jobs }],
      };
    }
    if (hits.length > 1) {
      return { text: `A few ${voice.jobs.toLowerCase()} match. Pick one:`, links: jobLinks(hits) };
    }
    const job = hits[0];
    await db()
      .update(jobs)
      .set({ status: "completed", completedAt: now.toISOString() })
      .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, organizationId)));
    await logActivity(organizationId, "job_completed", `Job completed: ${job.title}`, null, `/jobs/${job.id}`);
    return {
      text: `Marked ${job.title} complete.`,
      links: [{ href: `/jobs/${job.id}`, label: job.title }],
      did: "complete",
    };
  }

  const hits = await findJobs(organizationId, intent.query);
  if (!hits.length) {
    return {
      text: `I could not find a ${voice.job.toLowerCase()} matching "${intent.query}".`,
      links: [{ href: "/jobs", label: voice.jobs }],
    };
  }
  if (hits.length > 1) {
    return {
      text: `A few ${voice.jobs.toLowerCase()} match. Pick one, then ask me again with the full title.`,
      links: jobLinks(hits),
    };
  }
  const job = hits[0];
  await db()
    .update(jobs)
    .set({ scheduledStart: intent.when, status: "scheduled" })
    .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, organizationId)));
  await logActivity(organizationId, "job_rescheduled", `Moved ${job.title} to ${prettyWhen(intent.when)}`, null, `/jobs/${job.id}`);
  return {
    text: `Moved ${job.title} (${job.customer}) to ${prettyWhen(intent.when)}.`,
    links: [{ href: `/jobs/${job.id}`, label: job.title }, { href: "/calendar", label: "Calendar" }],
    did: "reschedule",
  };
}

export async function unreadAlertCount(organizationId: number): Promise<number> {
  const [totals, jobRows, invoiceRows] = await Promise.all([
    outstandingTotals(organizationId),
    db()
      .select({ id: jobs.id, scheduledStart: jobs.scheduledStart, status: jobs.status })
      .from(jobs)
      .where(eq(jobs.organizationId, organizationId)),
    db()
      .select({ id: invoices.id, status: invoices.status, dueDate: invoices.dueDate })
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId)),
  ]);
  const today = isoDate(new Date());
  const until = isoDate(addDays(new Date(), 3));
  const unscheduled = jobRows.filter((j) => !j.scheduledStart && j.status !== "cancelled" && j.status !== "completed").length;
  const todayCount = jobRows.filter((j) => j.scheduledStart?.slice(0, 10) === today && j.status !== "cancelled").length;
  const draftsOverdue = invoiceRows.filter((i) => i.status === "overdue" || i.status === "draft").length;
  const dueSoon = invoiceRows.filter((i) => {
    if (!["sent", "viewed", "partial"].includes(i.status)) return false;
    const due = i.dueDate?.slice(0, 10) || "";
    return due >= today && due <= until;
  }).length;
  return (totals.overdue > 0 ? 1 : 0) + (unscheduled ? 1 : 0) + (todayCount ? 1 : 0) + (draftsOverdue ? 1 : 0) + (dueSoon ? 1 : 0);
}

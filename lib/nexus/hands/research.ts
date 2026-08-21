/**
 * The Research hand: crawl a shop's own site for a contact and a real fact.
 *
 * Ported from RideBy's hands/research.ts. This is the step that makes the
 * outreach worth sending — without a researched fact Nova has nothing true to
 * open with, and the draft hand will refuse the company outright.
 *
 * Politeness is not optional here. robots.txt is honoured, page count is
 * capped so one sprawling site cannot eat a tick, and the crawler identifies
 * itself so anyone reading their logs knows who came by.
 */

import { and, eq } from "drizzle-orm";
import { db, nowISO } from "../../db";
import { nexusCompanies, nexusContacts } from "../../schema";
import { enqueueJob, logAction } from "../jobs";

const MAX_PAGES = 5;
const UA = "SereBot/1.0 (+https://sere.cash/about; local shop software outreach)";

/** Pages most likely to carry an owner's address and how they take work. */
const CANDIDATE_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/services"];

export function parseDisallowedPaths(robotsTxt: string): string[] {
  const lines = robotsTxt.split("\n");
  const disallowed: string[] = [];
  let appliesToUs = false;
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      appliesToUs = value === "*" || value.toLowerCase().includes("serebot");
      continue;
    }
    if (appliesToUs && key === "disallow" && value) disallowed.push(value);
  }
  return disallowed;
}

function blocked(path: string, disallowed: string[]): boolean {
  return disallowed.some((rule) => rule === "/" || path.startsWith(rule));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,text/plain" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return "";
  const type = response.headers.get("content-type") || "";
  if (!/text\/html|text\/plain/i.test(type)) return "";
  const body = await response.text();
  return body.slice(0, 400_000);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const JUNK_EMAIL = /(example|sentry|wixpress|godaddy|squarespace|wordpress|no-?reply|postmaster|abuse|privacy|dmca)/i;

function findEmails(html: string, host: string): string[] {
  const found = new Set<string>();
  const pattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  for (const match of html.match(pattern) || []) {
    const email = match.toLowerCase();
    if (JUNK_EMAIL.test(email)) continue;
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email)) continue;
    found.add(email);
  }
  // An address on the shop's own domain is far likelier to reach the owner.
  return [...found].sort((a, b) => {
    const aOwn = host && a.endsWith(`@${host}`) ? 0 : 1;
    const bOwn = host && b.endsWith(`@${host}`) ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    const aRole = /^(info|office|contact|hello|service)@/.test(a) ? 1 : 0;
    const bRole = /^(info|office|contact|hello|service)@/.test(b) ? 1 : 0;
    return aRole - bRole;
  });
}

function confidenceFor(email: string, host: string): number {
  let score = 40;
  if (host && email.endsWith(`@${host}`)) score += 35;
  if (!/^(info|office|contact|hello|service|sales)@/.test(email)) score += 15;
  if (/@(gmail|yahoo|hotmail|aol|outlook)\./.test(email)) score -= 15;
  return Math.max(5, Math.min(95, score));
}

/**
 * The fact is the whole point of this crawl. These are checkable observations
 * about how the shop takes work — the kind of thing an owner recognises as true
 * about his own website.
 */
export function deriveFact(pages: Array<{ path: string; html: string }>): string {
  const all = pages.map((p) => p.html).join(" ");
  const text = stripTags(all).toLowerCase();
  const hasForm = /<form[\s\S]*?>/i.test(all);
  const hasBooking =
    /(book (now|online)|schedule (online|service|now)|request (service|an estimate|a quote)|online scheduling)/i.test(
      text,
    );
  const hasPortal = /(customer portal|client login|pay (my |your )?bill online|pay invoice)/i.test(text);
  const phoneOnly = !hasForm && !hasBooking && /call (us|today|now)|give us a call/i.test(text);
  const emergency = /24\/?7|emergency service|same[- ]day/i.test(text);
  const financing = /financing available|payment plans/i.test(text);

  if (phoneOnly) return "your site takes work by phone only — no request form on it";
  if (hasForm && !hasBooking) return "your site has a contact form but no way to actually book a time";
  if (hasBooking && !hasPortal) {
    return "customers can book on your site but there is nowhere for them to see or pay an invoice";
  }
  if (emergency && !hasBooking) {
    return "you advertise same-day and emergency work but the site only gives a phone number";
  }
  if (financing && !hasPortal) {
    return "you offer financing but there is no way for a customer to pay online";
  }
  if (hasPortal) return "you already push customers to a portal to pay";
  return "";
}

export type ResearchResult = {
  pages: number;
  emails: number;
  fact: string;
  stage: string;
};

export async function runResearchCompany(companyId: number): Promise<ResearchResult> {
  const [company] = await db()
    .select()
    .from(nexusCompanies)
    .where(eq(nexusCompanies.id, companyId));
  if (!company) throw new Error(`No company ${companyId}.`);
  if (!company.website) {
    await db()
      .update(nexusCompanies)
      .set({
        researchStatus: "skipped",
        researchError: "No website to read.",
        updatedAt: nowISO(),
      })
      .where(eq(nexusCompanies.id, companyId));
    return { pages: 0, emails: 0, fact: "", stage: company.stage };
  }

  await db()
    .update(nexusCompanies)
    .set({ stage: "researching", researchStatus: "running", updatedAt: nowISO() })
    .where(eq(nexusCompanies.id, companyId));

  let origin = "";
  let host = "";
  try {
    const parsed = new URL(
      company.website.startsWith("http") ? company.website : `https://${company.website}`,
    );
    origin = parsed.origin;
    host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new Error(`Unreadable website: ${company.website}`);
  }

  let disallowed: string[] = [];
  try {
    disallowed = parseDisallowedPaths(await fetchText(`${origin}/robots.txt`));
  } catch {
    disallowed = [];
  }

  const pages: Array<{ path: string; html: string }> = [];
  for (const path of CANDIDATE_PATHS) {
    if (pages.length >= MAX_PAGES) break;
    if (blocked(path || "/", disallowed)) continue;
    try {
      const html = await fetchText(`${origin}${path}`);
      if (html) pages.push({ path: path || "/", html });
    } catch {
      // One dead page is not a failed crawl.
    }
  }

  if (!pages.length) {
    await db()
      .update(nexusCompanies)
      .set({
        stage: "new",
        researchStatus: "failed",
        researchError: "Nothing readable on the site.",
        researchPages: 0,
        updatedAt: nowISO(),
      })
      .where(eq(nexusCompanies.id, companyId));
    return { pages: 0, emails: 0, fact: "", stage: "new" };
  }

  const emails = findEmails(pages.map((p) => p.html).join(" "), host).slice(0, 3);
  let stored = 0;
  for (const email of emails) {
    const [existing] = await db()
      .select({ id: nexusContacts.id })
      .from(nexusContacts)
      .where(eq(nexusContacts.email, email));
    if (existing) continue;
    await db().insert(nexusContacts).values({
      companyId,
      email,
      sourceUrl: `${origin}${pages[0].path}`,
      confidence: confidenceFor(email, host),
      createdAt: nowISO(),
    });
    stored += 1;
  }

  const fact = deriveFact(pages);
  // Ready means: we can reach them, and we have something true to say.
  const stage = emails.length && fact ? "ready" : "new";
  await db()
    .update(nexusCompanies)
    .set({
      stage,
      fact,
      researchStatus: "done",
      researchError: emails.length
        ? fact
          ? ""
          : "No usable fact found on the site."
        : "No contact email found.",
      researchPages: pages.length,
      updatedAt: nowISO(),
    })
    .where(eq(nexusCompanies.id, companyId));

  await logAction({
    action: "research.company",
    entityType: "company",
    entityId: companyId,
    detail: `${company.name}: ${pages.length} page(s), ${stored} new contact(s), fact ${fact ? "found" : "missing"}`,
  });

  if (stage === "ready") {
    await enqueueJob("outreach.draft", { companyId }, { dedupeKey: `draft:${companyId}` });
  }
  return { pages: pages.length, emails: emails.length, fact, stage };
}

/** Queues research for companies that still need it. */
export async function queueResearch(limit: number): Promise<number> {
  const rows = await db()
    .select({ id: nexusCompanies.id })
    .from(nexusCompanies)
    .where(and(eq(nexusCompanies.stage, "new"), eq(nexusCompanies.researchStatus, "pending")))
    .limit(limit);
  let queued = 0;
  for (const row of rows) {
    const id = await enqueueJob(
      "research.company",
      { companyId: row.id },
      { dedupeKey: `research:${row.id}` },
    );
    if (id) queued += 1;
  }
  return queued;
}

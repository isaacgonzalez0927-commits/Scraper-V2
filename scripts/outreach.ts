/**
 * Nova outreach, from the terminal. No routes, no UI, no surface inside the
 * app that a shop could stumble into.
 *
 *   npx tsx scripts/outreach.ts init
 *   npx tsx scripts/outreach.ts import prospects.csv
 *   npx tsx scripts/outreach.ts draft --limit 10
 *   npx tsx scripts/outreach.ts review
 *   npx tsx scripts/outreach.ts send --limit 10
 *   npx tsx scripts/outreach.ts outcome replied someone@shop.com
 *   npx tsx scripts/outreach.ts stats
 *
 * Nothing sends without approval, and send stops at the first failure rather
 * than marching through a list.
 */

import { readFileSync } from "node:fs";
import { finalBody, prospectReady, SERE, type Product } from "../lib/outreach/copy";
import { nextVariant, pickWinners, variantStats } from "../lib/outreach/learn";
import { draftEmail, novaCredentials } from "../lib/outreach/nova";
import {
  senderFromEnv,
  senderProblems,
  sendOutreachEmail,
  transactionalFromEnv,
} from "../lib/outreach/send";
import {
  addProspect,
  approveDraft,
  discardDraft,
  initOutreach,
  listProspects,
  markSent,
  pendingDrafts,
  recordOutcome,
  saveDraft,
  sentHistory,
  unsubscribe,
  untouchedProspects,
  type OutcomeKind,
} from "../lib/outreach/store";

const VARIANTS = ["a", "b"];

function product(): Product {
  return {
    ...SERE,
    senderName: process.env.OUTREACH_SENDER_NAME || SERE.senderName,
    postalAddress: process.env.OUTREACH_POSTAL_ADDRESS || "",
  };
}

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim()));
}

async function cmdImport(file: string): Promise<void> {
  if (!file) throw new Error("Usage: import <file.csv>");
  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length < 2) throw new Error("That CSV has no rows under its header.");
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const need = ["company", "email"];
  for (const column of need) {
    if (!headers.includes(column)) throw new Error(`CSV needs a "${column}" column.`);
  }
  const pick = (row: string[], name: string) => {
    const at = headers.indexOf(name);
    return at === -1 ? "" : (row[at] || "").trim();
  };
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const email = pick(row, "email");
    const company = pick(row, "company");
    if (!email.includes("@") || !company) {
      skipped += 1;
      continue;
    }
    const result = await addProspect({
      company,
      contact: pick(row, "contact"),
      email,
      trade: pick(row, "trade"),
      city: pick(row, "city"),
      website: pick(row, "website"),
      fact: pick(row, "fact"),
      source: pick(row, "source") || file,
    });
    if (result === "added") added += 1;
    else updated += 1;
  }
  console.log(`Imported ${added} new, updated ${updated}, skipped ${skipped}.`);
  const missing = (await listProspects()).filter((p) => prospectReady(p).length);
  if (missing.length) {
    console.log(
      `\n${missing.length} prospect(s) are not ready to email, almost always a ` +
        "missing fact. Nova will refuse them:",
    );
    for (const prospect of missing.slice(0, 10)) {
      console.log(`  ${prospect.email} — ${prospectReady(prospect).join(" ")}`);
    }
  }
}

async function cmdDraft(): Promise<void> {
  const credentials = novaCredentials();
  if (!credentials) {
    throw new Error("Set OUTREACH_OPENAI_API_KEY (or OPENAI_API_KEY) first.");
  }
  const limit = flag("limit", 10);
  const queue = await untouchedProspects(limit * 3);
  const ready = queue.filter((prospect) => !prospectReady(prospect).length).slice(0, limit);
  if (!ready.length) {
    console.log("Nothing ready to draft. Every queued prospect is missing a fact.");
    return;
  }
  const history = await sentHistory();
  const variant = nextVariant(history, VARIANTS);
  console.log(`Drafting ${ready.length} with variant ${variant}.\n`);

  for (const prospect of ready) {
    const winners = pickWinners(history, prospect);
    try {
      const result = await draftEmail(credentials, product(), prospect, winners);
      if (result.problems.length) {
        console.log(`✗ ${prospect.email} — could not write a clean draft:`);
        for (const problem of result.problems) console.log(`    ${problem}`);
        continue;
      }
      const id = await saveDraft(prospect.id, product().key, variant, result.draft);
      console.log(
        `✓ #${id} ${prospect.email} — "${result.draft.subject}" ` +
          `(${result.attempts} attempt(s), ${result.winnersUsed} example(s))`,
      );
    } catch (error) {
      console.log(`✗ ${prospect.email} — ${(error as Error).message}`);
    }
  }
  console.log("\nReview them with: npx tsx scripts/outreach.ts review");
}

async function cmdReview(): Promise<void> {
  const drafts = await pendingDrafts();
  if (!drafts.length) {
    console.log("No drafts waiting.");
    return;
  }
  const copy = product();
  for (const { email, prospect } of drafts) {
    console.log("─".repeat(64));
    console.log(`#${email.id}  ${prospect.company} <${prospect.email}>`);
    console.log(`fact: ${prospect.fact}`);
    console.log(`variant: ${email.variant}${email.approvedAt ? "  APPROVED" : ""}`);
    console.log(`subject: ${email.subject}`);
    console.log("");
    console.log(finalBody(email, copy));
    console.log("");
  }
  console.log("─".repeat(64));
  console.log(`${drafts.length} draft(s).`);
  console.log("Approve: npx tsx scripts/outreach.ts approve <id|all>");
  console.log("Discard: npx tsx scripts/outreach.ts discard <id>");
}

async function cmdApprove(target: string): Promise<void> {
  const drafts = await pendingDrafts();
  const chosen = target === "all" ? drafts : drafts.filter((d) => d.email.id === Number(target));
  if (!chosen.length) throw new Error("No matching draft.");
  for (const { email } of chosen) await approveDraft(email.id);
  console.log(`Approved ${chosen.length}. Send with: npx tsx scripts/outreach.ts send`);
}

async function cmdSend(): Promise<void> {
  const sender = senderFromEnv();
  const problems = senderProblems(sender, transactionalFromEnv());
  if (problems.length || !sender) {
    console.error("Refusing to send:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  const copy = product();
  const limit = flag("limit", 10);
  const approved = (await pendingDrafts()).filter((d) => d.email.approvedAt).slice(0, limit);
  if (!approved.length) {
    console.log("Nothing approved to send.");
    return;
  }
  let sent = 0;
  for (const { email, prospect } of approved) {
    if (prospect.unsubscribedAt) {
      console.log(`- skipped ${prospect.email}, opted out`);
      continue;
    }
    try {
      const result = await sendOutreachEmail(sender, copy, {
        to: prospect.email,
        subject: email.subject,
        body: finalBody(email, copy),
      });
      await markSent(email.id, result.providerId);
      sent += 1;
      console.log(`→ ${prospect.email}`);
      // Slow on purpose. A new domain that bursts a list gets filtered.
      await new Promise((resolve) => setTimeout(resolve, 4000));
    } catch (error) {
      console.error(`\nStopped at ${prospect.email}: ${(error as Error).message}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`\nSent ${sent}.`);
  console.log("Record what comes back: npx tsx scripts/outreach.ts outcome replied <email>");
}

async function cmdOutcome(kind: string, email: string): Promise<void> {
  const kinds: OutcomeKind[] = ["replied", "demo", "signup", "bounced", "complained"];
  if (!kinds.includes(kind as OutcomeKind)) {
    throw new Error(`Usage: outcome <${kinds.join("|")}> <email>`);
  }
  const done = await recordOutcome(email, kind as OutcomeKind);
  if (!done) throw new Error(`No sent email found for ${email}.`);
  console.log(`Recorded ${kind} for ${email}.`);
  if (kind === "complained") console.log("Also opted them out.");
}

async function cmdStats(): Promise<void> {
  const history = await sentHistory();
  if (!history.length) {
    console.log("Nothing sent yet.");
    return;
  }
  const replied = history.filter((e) => e.repliedAt).length;
  const demos = history.filter((e) => e.openedDemoAt).length;
  const signups = history.filter((e) => e.signedUpAt).length;
  const complaints = history.filter((e) => e.complainedAt).length;
  const pct = (n: number) => `${((n / history.length) * 100).toFixed(1)}%`;
  console.log(`sent       ${history.length}`);
  console.log(`demo opens ${demos} (${pct(demos)})`);
  console.log(`replies    ${replied} (${pct(replied)})`);
  console.log(`signups    ${signups} (${pct(signups)})`);
  console.log(`complaints ${complaints} (${pct(complaints)})`);
  console.log("\nby variant");
  for (const row of variantStats(history)) {
    console.log(
      `  ${row.variant}  sent ${row.sent}  replies ${row.replied} ` +
        `(${(row.replyRate * 100).toFixed(1)}%)  signups ${row.signedUp}  ` +
        `score ${row.score.toFixed(1)}`,
    );
  }
  const winners = pickWinners(history, { trade: "", city: "" }, 3);
  if (winners.length) {
    console.log("\nwhat Nova is currently learning from");
    for (const winner of winners) console.log(`  "${winner.subject}"`);
  } else {
    console.log("\nNo winners yet, so Nova is drafting from rules alone.");
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  await initOutreach();
  switch (command) {
    case "init":
      console.log("Outreach database ready.");
      return;
    case "import":
      return cmdImport(rest[0]);
    case "draft":
      return cmdDraft();
    case "review":
      return cmdReview();
    case "approve":
      return cmdApprove(rest[0] || "");
    case "discard": {
      await discardDraft(Number(rest[0]));
      console.log("Discarded.");
      return;
    }
    case "send":
      return cmdSend();
    case "outcome":
      return cmdOutcome(rest[0] || "", rest[1] || "");
    case "unsubscribe": {
      const done = await unsubscribe(rest[0] || "");
      console.log(done ? "Opted out." : "Not found, or already out.");
      return;
    }
    case "stats":
      return cmdStats();
    default:
      console.log(
        [
          "Nova outreach",
          "",
          "  init                      create the outreach database",
          "  import <file.csv>         company,email,contact,trade,city,website,fact",
          "  draft [--limit 10]        draft for prospects that have a fact",
          "  review                    read every pending draft",
          "  approve <id|all>          approve for sending",
          "  discard <id>              throw a draft away",
          "  send [--limit 10]         send approved drafts, slowly",
          "  outcome <kind> <email>    replied | demo | signup | bounced | complained",
          "  unsubscribe <email>       never email them again",
          "  stats                     reply rate, variants, what Nova learns from",
        ].join("\n"),
      );
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

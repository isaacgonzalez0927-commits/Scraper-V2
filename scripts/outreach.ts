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
import { circuitBreaker, pauseSeconds, planRun, sendingWindow } from "../lib/outreach/guard";
import { nextVariant, pickWinners, variantStats } from "../lib/outreach/learn";
import { draftEmail, novaCredentials } from "../lib/outreach/nova";
import { fetchDeliveryEvent } from "../lib/outreach/poll";
import {
  senderFromEnv,
  senderProblems,
  sendOutreachEmail,
  transactionalFromEnv,
} from "../lib/outreach/send";
import {
  addProspect,
  approveDraft,
  awaitingDelivery,
  discardDraft,
  initOutreach,
  listProspects,
  markSent,
  pendingDrafts,
  recordOutcome,
  saveDraft,
  sentHistory,
  setDeliveryOutcome,
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

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Pulls delivery results back in so the breakers see reality. Runs on its own
 * and as the first step of an autonomous run.
 */
async function cmdSync(): Promise<number> {
  const sender = senderFromEnv();
  if (!sender) {
    console.log("Outreach sending is not configured, so there is nothing to sync.");
    return 0;
  }
  const pending = await awaitingDelivery();
  let changed = 0;
  for (const row of pending) {
    try {
      const event = await fetchDeliveryEvent(sender.apiKey, row.providerId);
      if (event === "bounced" || event === "complained") {
        await setDeliveryOutcome(row.id, event);
        await unsubscribe(row.email);
        changed += 1;
        console.log(`  ${event}: ${row.email}`);
      }
    } catch (error) {
      console.error(`  could not check ${row.email}: ${(error as Error).message}`);
      break;
    }
  }
  console.log(`Synced ${pending.length} message(s), ${changed} new bounce/complaint.`);
  return changed;
}

/**
 * The autonomous loop: sync outcomes, decide whether it is safe to send, draft
 * inside the day's headroom, and send paced out. No approval step — the
 * validator and the breakers are the gate instead of a person.
 *
 * Cron it. It is safe to run more often than the cap allows, because the cap is
 * enforced from what has actually been sent today, not from how often this runs.
 */
async function cmdRun(): Promise<void> {
  const dry = has("dry-run");
  const credentials = novaCredentials();
  if (!credentials) throw new Error("Set OUTREACH_OPENAI_API_KEY (or OPENAI_API_KEY) first.");

  const sender = senderFromEnv();
  const senderIssues = senderProblems(sender, transactionalFromEnv());
  if (!dry && (senderIssues.length || !sender)) {
    console.error("Refusing to run:\n");
    for (const problem of senderIssues) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log("1. syncing delivery outcomes");
  if (!dry) await cmdSync();

  let history = await sentHistory();
  const plan = planRun(history, { batch: flag("limit", 0) || undefined });
  for (const note of plan.notes) console.log(`   ${note}`);
  if (plan.breaker.tripped) {
    console.error("\nSTOPPED. Sending is unsafe right now:\n");
    for (const reason of plan.breaker.reasons) console.error(`  - ${reason}`);
    console.error(
      "\nNothing will send until the recent numbers improve. Fix the list or " +
        "the copy; do not raise the threshold.",
    );
    process.exitCode = 1;
    return;
  }
  if (!plan.send) {
    console.log("\nNothing to do. Cap reached for today.");
    return;
  }

  console.log(`\n2. drafting up to ${plan.send}`);
  const queue = await untouchedProspects(plan.send * 3);
  const ready = queue.filter((prospect) => !prospectReady(prospect).length).slice(0, plan.send);
  if (!ready.length) {
    console.log("   no prospect has a researched fact — nothing to draft");
    console.log("   add facts to the CSV and re-import; Nova will not invent them");
    return;
  }
  const copy = product();
  const variant = nextVariant(history, VARIANTS);
  const queued: Array<{ id: number; to: string; subject: string; body: string }> = [];
  for (const prospect of ready) {
    try {
      const result = await draftEmail(credentials, copy, prospect, pickWinners(history, prospect));
      if (result.problems.length) {
        console.log(`   ✗ ${prospect.email} — draft never came out clean, skipped`);
        continue;
      }
      const id = dry ? 0 : await saveDraft(prospect.id, copy.key, variant, result.draft);
      if (!dry) await approveDraft(id);
      queued.push({
        id,
        to: prospect.email,
        subject: result.draft.subject,
        body: finalBody(result.draft, copy),
      });
      console.log(`   ✓ ${prospect.email} — "${result.draft.subject}"`);
    } catch (error) {
      console.log(`   ✗ ${prospect.email} — ${(error as Error).message}`);
    }
  }

  if (!queued.length) {
    console.log("\nNothing survived drafting. Nothing sent.");
    return;
  }
  if (dry) {
    console.log(`\n3. dry run — would send ${queued.length}, sending nothing`);
    console.log(`   pacing would be ${pauseSeconds(queued.length)}s between sends`);
    return;
  }

  const gap = pauseSeconds(queued.length);
  console.log(`\n3. sending ${queued.length}, ${gap}s apart`);
  let sent = 0;
  for (const message of queued) {
    try {
      const result = await sendOutreachEmail(sender!, copy, message);
      await markSent(message.id, result.providerId);
      sent += 1;
      console.log(`   → ${message.to}`);
    } catch (error) {
      console.error(`   stopped at ${message.to}: ${(error as Error).message}`);
      process.exitCode = 1;
      break;
    }
    // Re-check the breaker mid-batch so a complaint that lands during a run
    // stops the rest of it.
    if (sent % 10 === 0) {
      history = await sentHistory();
      const live = circuitBreaker(history);
      if (live.tripped) {
        console.error(`   stopping mid-batch: ${live.reasons.join(" ")}`);
        break;
      }
    }
    if (gap) await new Promise((resolve) => setTimeout(resolve, gap * 1000));
  }
  const window = sendingWindow(await sentHistory());
  console.log(`\nSent ${sent}. Today: ${window.sentToday}/${window.dailyCap} (day ${window.day}).`);
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

  const window = sendingWindow(history);
  console.log(
    `\nsending day ${window.day}, cap ${window.dailyCap}/day, ` +
      `${window.sentToday} sent today`,
  );
  const breaker = circuitBreaker(history);
  if (breaker.tripped) {
    console.log("\nCIRCUIT BREAKER OPEN — autonomous runs will not send:");
    for (const reason of breaker.reasons) console.log(`  - ${reason}`);
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
    case "run":
      return cmdRun();
    case "sync": {
      await cmdSync();
      return;
    }
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
          "",
          "  run [--limit N] [--dry-run]",
          "                            autonomous: sync, check safety, draft, send",
          "                            paced inside today's cap. Cron this.",
          "  sync                      pull bounces and complaints from the provider",
          "",
          "  draft [--limit 10]        draft only, for review by hand",
          "  review                    read every pending draft",
          "  approve <id|all>          approve for sending",
          "  discard <id>              throw a draft away",
          "  send [--limit 10]         send approved drafts, slowly",
          "",
          "  outcome <kind> <email>    replied | demo | signup | bounced | complained",
          "  unsubscribe <email>       never email them again",
          "  stats                     reply rate, variants, cap, breaker state",
        ].join("\n"),
      );
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

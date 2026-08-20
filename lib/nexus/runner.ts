/**
 * The tick. Ported from RideBy's nexus/runner.ts.
 *
 * Claims a few jobs, runs the matching hand, records the outcome. Deliberately
 * small per tick: a cron every few minutes doing a little is safer than one
 * long run doing everything, and it means a crash loses one job rather than a
 * whole batch.
 *
 * Sending is the exception — it is not driven off the queue's own pace but
 * gated by the policy, so pacing, the daily cap, the window, and the breakers
 * all apply no matter how the job got queued.
 */

import { claimJobs, completeJob, enqueueJob, failJob, pruneJobs, requeueStaleJobs, queueDepth } from "./jobs";
import { runLeadSearch } from "./hands/lead";
import { queueResearch, runResearchCompany } from "./hands/research";
import { queueDrafts, runOutreachDraft, runOutreachReview } from "./hands/draft";
import { approvedDrafts, runOutreachSend, sentHistory } from "./hands/send";
import { nextSendDelaySeconds, planSends } from "./policy";

export type TickResult = {
  claimed: number;
  done: number;
  failed: number;
  requeuedStale: number;
  queuedResearch: number;
  queuedDrafts: number;
  queuedSends: number;
  sent: number;
  notes: string[];
};

const JOBS_PER_TICK = 4;

export async function runTick(options: { jobs?: number } = {}): Promise<TickResult> {
  const result: TickResult = {
    claimed: 0,
    done: 0,
    failed: 0,
    requeuedStale: 0,
    queuedResearch: 0,
    queuedDrafts: 0,
    queuedSends: 0,
    sent: 0,
    notes: [],
  };

  result.requeuedStale = await requeueStaleJobs();
  await pruneJobs();

  const jobs = await claimJobs(options.jobs ?? JOBS_PER_TICK);
  result.claimed = jobs.length;

  for (const job of jobs) {
    try {
      switch (job.type) {
        case "lead.search": {
          const query = String(job.payload.query || "");
          if (!query) throw new Error("lead.search with no query.");
          const found = await runLeadSearch(query, {
            cityHint: job.payload.cityHint ? String(job.payload.cityHint) : undefined,
            maxResults: Number(job.payload.maxResults) || undefined,
          });
          result.notes.push(
            `search "${query}": ${found.stored} kept, ${found.disqualified} filtered`,
          );
          break;
        }
        case "research.company": {
          const companyId = Number(job.payload.companyId);
          const research = await runResearchCompany(companyId);
          result.notes.push(
            `research ${companyId}: ${research.pages} page(s), ${research.emails} email(s), ${research.stage}`,
          );
          break;
        }
        case "outreach.draft": {
          const companyId = Number(job.payload.companyId);
          const draft = await runOutreachDraft(companyId);
          result.notes.push(
            draft.draftId
              ? `draft ${draft.draftId}: "${draft.subject}"`
              : `draft skipped for ${companyId}: ${draft.problems[0] || "rejected"}`,
          );
          break;
        }
        case "outreach.review": {
          const draftId = Number(job.payload.draftId);
          const review = await runOutreachReview(draftId);
          result.notes.push(
            `review ${draftId}: ${review.score}/100 ${review.approved ? "approved" : "rejected"}`,
          );
          break;
        }
        case "outreach.send": {
          const draftId = Number(job.payload.draftId);
          const sent = await runOutreachSend(draftId);
          if (sent.sent) {
            result.sent += 1;
            result.notes.push(`sent ${draftId}`);
          } else {
            result.notes.push(`send ${draftId} held: ${sent.error}`);
          }
          break;
        }
        default:
          throw new Error(`Unknown job type ${job.type}.`);
      }
      await completeJob(job.id);
      result.done += 1;
    } catch (error) {
      await failJob(job, (error as Error).message);
      result.failed += 1;
      result.notes.push(`${job.type} failed: ${(error as Error).message}`);
    }
  }

  // Keep the funnel fed: research what has never been read, draft what is ready.
  const depth = await queueDepth();
  if ((depth.byType["research.company"] || 0) < 5) {
    result.queuedResearch = await queueResearch(5);
  }
  if ((depth.byType["outreach.draft"] || 0) < 5) {
    result.queuedDrafts = await queueDrafts(5);
  }

  // Sending is gated by policy, not by queue depth.
  const history = await sentHistory();
  const plan = planSends(history);
  if (plan.send > 0) {
    const ready = await approvedDrafts(plan.send);
    let delay = 0;
    for (const draft of ready) {
      const queued = await enqueueJob(
        "outreach.send",
        { draftId: draft.id },
        { dedupeKey: `send:${draft.id}`, delaySeconds: delay },
      );
      if (queued) result.queuedSends += 1;
      // Spread them out so a batch reads like a person working through a list.
      delay += nextSendDelaySeconds();
    }
    if (result.queuedSends) {
      result.notes.push(`queued ${result.queuedSends} send(s), paced`);
    }
  } else if (plan.blocked.length) {
    result.notes.push(`not sending: ${plan.blocked[0]}`);
  }

  return result;
}

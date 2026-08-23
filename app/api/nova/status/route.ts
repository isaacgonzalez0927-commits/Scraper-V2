/**
 * Outreach numbers for the operator console. No shop book.
 */

import { currentContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { novaKey, NOVA_MODEL } from "@/lib/nova/chat";
import { getNovaClock } from "@/lib/nova/clock";
import { NOVA_FORBIDDEN, isNovaOperator } from "@/lib/nova/operator";
import { loadOutreachState, outreachHeadline } from "@/lib/nexus/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await boot();
  const ctx = await currentContext(request);
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isNovaOperator(ctx.user.email)) {
    return Response.json({ error: NOVA_FORBIDDEN }, { status: 403 });
  }

  const state = await loadOutreachState();
  const sendNote = state.send.enabled
    ? state.send.clearToSend
      ? "Sending is armed."
      : state.send.blocked[0] || "Sending is on but not clear to send."
    : "Sending is off. Drafting and queueing only.";

  return Response.json({
    kind: "nova",
    shop: "Sere outreach",
    trade: "outreach",
    headline: outreachHeadline(state),
    clock: getNovaClock(),
    online: Boolean(novaKey()),
    model: NOVA_MODEL,
    writable: true,
    plan: "operator",
    sendEnabled: state.send.enabled,
    counts: {
      today: state.pipeline.total,
      tomorrow: state.drafts.pendingReview,
      unscheduled: state.queue.queued,
      finishedNotInvoiced: 0,
      overdue: 0,
      drafts: state.drafts.pendingReview,
      pipeline: state.pipeline.total,
      sent: state.learning.sent,
      replies: state.learning.replies,
    },
    followUps: [
      sendNote,
      state.learning.note,
      ...state.send.problems.slice(0, 3),
    ].filter(Boolean),
  });
}

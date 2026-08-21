/**
 * What Nova knows, without spending a model call. The console polls this so the
 * header numbers are live even when nobody is talking.
 */

import { currentContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { novaKey, NOVA_MODEL } from "@/lib/nova/chat";
import { getNovaClock } from "@/lib/nova/clock";
import { dossierHeadline, loadDossier } from "@/lib/nova/dossier";
import { DEMO_EMAIL } from "@/lib/seed";
import { ensureTrialClock, shopAccess } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await boot();
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });

  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  const dossier = await loadDossier(org.id, isDemo);

  return Response.json({
    shop: dossier.shop,
    trade: dossier.trade,
    headline: dossierHeadline(dossier),
    clock: getNovaClock(),
    online: Boolean(novaKey()),
    model: NOVA_MODEL,
    writable: !access.frozen && !isDemo,
    plan: access.status,
    money: dossier.money,
    counts: {
      today: dossier.board.today.length,
      tomorrow: dossier.board.tomorrow.length,
      unscheduled: dossier.board.unscheduled.length,
      finishedNotInvoiced: dossier.board.finishedNotInvoiced.length,
      overdue: dossier.invoices.overdue.length,
      drafts: dossier.invoices.drafts,
    },
    followUps: dossier.followUps.slice(0, 5),
  });
}

/**
 * What Serenity knows, without a model call. Shop board and books only.
 */

import { currentContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { formatUsdFromMicros, loadShopCredit } from "@/lib/openai-budget";
import { novaKey, NOVA_MODEL } from "@/lib/nova/chat";
import { getNovaClock } from "@/lib/nova/clock";
import { dossierHeadline, loadDossier } from "@/lib/nova/dossier";
import { DEMO_EMAIL } from "@/lib/seed";
import { ensureTrialClock, shopAccess } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await boot();
  const ctx = await currentContext(request);
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });

  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  const dossier = await loadDossier(org.id, isDemo);
  const credit = await loadShopCredit(org.id);

  return Response.json({
    kind: "serenity",
    shop: dossier.shop,
    trade: dossier.trade,
    headline: dossierHeadline(dossier),
    clock: getNovaClock(),
    online: Boolean(novaKey()) && !credit.exhausted,
    model: NOVA_MODEL,
    credit: {
      used: formatUsdFromMicros(credit.spentMicros),
      budget: formatUsdFromMicros(credit.budgetMicros),
      remaining: formatUsdFromMicros(credit.remainingMicros),
      exhausted: credit.exhausted,
    },
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

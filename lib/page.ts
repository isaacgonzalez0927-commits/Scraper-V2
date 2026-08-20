import { requireContext } from "./auth";
import { buildBrief } from "./assistant";
import { tradeCopy } from "./business";
import { unreadCount } from "./queries";
import { DEMO_EMAIL } from "./seed";
import { ensureTrialClock, shopAccess } from "./trial";

export async function loadApp() {
  const ctx = await requireContext();
  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  const voice = tradeCopy(org.businessType);
  const [unread, brief] = await Promise.all([
    unreadCount(org.id),
    buildBrief(org.id, ctx.user.name, org.businessType),
  ]);
  return {
    ...ctx,
    org,
    access,
    unread,
    voice,
    brief,
    shell: {
      orgName: org.name,
      userName: ctx.user.name,
      unread,
      isDemo,
      frozen: access.frozen,
      trialBanner: access.banner,
      tradeName: voice.name,
      worker: voice.worker,
      jobsLabel: voice.jobs,
      customersLabel: voice.customers,
      searchHint: voice.searchHint,
      brief,
    },
  };
}

import { requireContext } from "./auth";
import { buildBrief } from "./assistant";
import { tradeCopy } from "./business";
import { unreadCount } from "./queries";
import { DEMO_EMAIL } from "./seed";

export async function loadApp() {
  const ctx = await requireContext();
  const voice = tradeCopy(ctx.org.businessType);
  const [unread, brief] = await Promise.all([
    unreadCount(ctx.org.id),
    buildBrief(ctx.org.id, ctx.user.name, ctx.org.businessType),
  ]);
  return {
    ...ctx,
    unread,
    voice,
    brief,
    shell: {
      orgName: ctx.org.name,
      userName: ctx.user.name,
      unread,
      isDemo: ctx.user.email === DEMO_EMAIL,
      tradeName: voice.name,
      worker: voice.worker,
      jobsLabel: voice.jobs,
      customersLabel: voice.customers,
      searchHint: voice.searchHint,
      brief,
    },
  };
}

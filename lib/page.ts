import { requireContext } from "./auth";
import { unreadCount } from "./queries";
import { DEMO_EMAIL } from "./seed";

export async function loadApp() {
  const ctx = await requireContext();
  const unread = await unreadCount(ctx.org.id);
  return {
    ...ctx,
    unread,
    shell: {
      orgName: ctx.org.name,
      userName: ctx.user.name,
      unread,
      // Anyone can open this company without signing in, so say so in the UI.
      isDemo: ctx.user.email === DEMO_EMAIL,
    },
  };
}

import { requireContext } from "./auth";
import { unreadCount } from "./queries";

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
    },
  };
}

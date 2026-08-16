import { desc, eq } from "drizzle-orm";
import { markNotificationsReadAction } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { prettyWhen } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { notifications } from "@/lib/schema";

export default async function NotificationsPage() {
  const { org, shell } = await loadApp();
  const rows = await db()
    .select()
    .from(notifications)
    .where(eq(notifications.organizationId, org.id))
    .orderBy(desc(notifications.createdAt));

  return (
    <Shell
      {...shell}
      path="/notifications"
      title="Alerts"
      actions={
        <form action={markNotificationsReadAction}>
          <button className="btn btn-secondary btn-sm" type="submit">Mark all read</button>
        </form>
      }
    >
      <section className="card">
        {rows.length ? (
          <ul className="list">
            {rows.map((n) => (
              <li key={n.id} style={n.readAt ? { opacity: 0.6 } : undefined}>
                <div>
                  <a href={n.link || "/overview"}>{n.title}</a>
                  <div className="tiny">{n.body} · {prettyWhen(n.createdAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No alerts yet.</p>
        )}
      </section>
    </Shell>
  );
}

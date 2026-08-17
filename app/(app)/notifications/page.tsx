import { desc, eq } from "drizzle-orm";
import { markNotificationsReadAction } from "@/app/actions";
import { Card, Empty } from "@/components/ui";
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
  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <Shell
      {...shell}
      path="/notifications"
      title="Alerts"
      sub={<p className="page-sub">{unread ? `${unread} unread` : "Everything is read."}</p>}
      actions={
        unread ? (
          <form action={markNotificationsReadAction}>
            <button className="btn btn-secondary" type="submit">Mark all read</button>
          </form>
        ) : null
      }
    >
      {rows.length ? (
        <Card flush>
          <ul className="list">
            {rows.map((n) => (
              <li key={n.id} style={{ padding: "12px 18px" }}>
                <div>
                  <a className="rowlink" href={n.link || "/overview"}>{n.title}</a>
                  <div className="tiny">
                    {n.body ? `${n.body} · ` : ""}
                    {prettyWhen(n.createdAt)}
                  </div>
                </div>
                {n.readAt ? null : <span className="badge badge-viewed">New</span>}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty
          title="No alerts yet"
          body="Sere tells you when an invoice is viewed, paid, or goes overdue."
        />
      )}
    </Shell>
  );
}

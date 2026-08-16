import { and, eq, isNull } from "drizzle-orm";
import { rescheduleJobAction } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { prettyDate } from "@/lib/labels";
import { loadApp } from "@/lib/page";
import { isoDate } from "@/lib/queries";
import { customers, jobs } from "@/lib/schema";

function startOfWeek(d: Date) {
  const copy = new Date(d);
  copy.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(d.getDate() + n);
  return copy;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { org, shell } = await loadApp();
  const q = await searchParams;
  const view = q.view === "day" || q.view === "week" ? q.view : "month";
  const anchor = q.date ? new Date(`${q.date}T00:00:00`) : new Date();
  const today = isoDate(new Date());

  let days: Date[] = [];
  if (view === "day") days = [anchor];
  else if (view === "week") days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  else {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }

  const rows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(eq(jobs.organizationId, org.id));
  const byDay = new Map<string, typeof rows>();
  for (const row of rows) {
    const day = row.job.scheduledStart?.slice(0, 10);
    if (!day) continue;
    const list = byDay.get(day) || [];
    list.push(row);
    byDay.set(day, list);
  }
  const unscheduled = rows.filter((r) => !r.job.scheduledStart && r.job.status === "unscheduled");
  const start = days[0];
  const end = days[days.length - 1];
  const dateParam = isoDate(anchor);

  return (
    <Shell
      {...shell}
      path="/calendar"
      title="Calendar"
      sub={<p className="page-sub">{prettyDate(isoDate(start))} – {prettyDate(isoDate(end))}</p>}
      actions={
        <>
          {(["day", "week", "month"] as const).map((v) => (
            <a key={v} className={`chip ${view === v ? "active" : ""}`} href={`/calendar?view=${v}&date=${dateParam}`}>
              {v[0].toUpperCase() + v.slice(1)}
            </a>
          ))}
          <a className="btn" href={`/jobs/new?start=${dateParam}T09:00`}>Schedule job</a>
        </>
      }
    >
      <div className={`cal ${view !== "day" ? "cal-week" : ""}`}>
        {days.map((day) => {
          const key = isoDate(day);
          const items = byDay.get(key) || [];
          const out = view === "month" && day.getMonth() !== anchor.getMonth();
          return (
            <div
              key={key}
              className={`cal-day ${key === today ? "today" : ""} ${out ? "out" : ""}`}
              data-date={key}
            >
              <strong>{day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}</strong>
              {items.map(({ job }) => (
                <a
                  key={job.id}
                  className="cal-event"
                  href={`/jobs/${job.id}`}
                  draggable
                  data-job={String(job.id)}
                >
                  {job.title}
                </a>
              ))}
              <a className="tiny" href={`/jobs/new?start=${key}T09:00`}>+ job</a>
            </div>
          );
        })}
      </div>
      {unscheduled.length ? (
        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-title">Unscheduled</div>
          {unscheduled.map(({ job, customer }) => (
            <form action={rescheduleJobAction} key={job.id} style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="next" value="/calendar" />
              <a href={`/jobs/${job.id}`}>{job.title}</a>
              <span className="tiny">{displayName(customer)}</span>
              <input type="datetime-local" name="scheduled_start" />
              <button className="btn btn-secondary btn-sm" type="submit">Schedule</button>
            </form>
          ))}
        </section>
      ) : null}
    </Shell>
  );
}

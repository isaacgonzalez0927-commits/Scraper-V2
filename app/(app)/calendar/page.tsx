import { eq } from "drizzle-orm";
import { rescheduleJobAction } from "@/app/actions";
import { Badge, Card, ChevronIcon, Tabs } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { prettyDate, prettyWhen } from "@/lib/labels";
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
  const dateParam = isoDate(anchor);
  const rangeStart = isoDate(days[0]);
  const rangeEnd = isoDate(days[days.length - 1]);
  /* The phone shows an agenda under the grid, since a dot cannot say much. */
  const agenda = rows
    .filter((r) => {
      const day = r.job.scheduledStart?.slice(0, 10);
      return day && day >= rangeStart && day <= rangeEnd;
    })
    .sort((a, b) => (a.job.scheduledStart || "").localeCompare(b.job.scheduledStart || ""));

  const shift = (direction: 1 | -1) => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + direction);
    else if (view === "week") next.setDate(next.getDate() + 7 * direction);
    else next.setMonth(next.getMonth() + direction);
    return `/calendar?view=${view}&date=${isoDate(next)}`;
  };

  return (
    <Shell
      {...shell}
      path="/calendar"
      title="Calendar"
      sub={
        <>
          <p className="page-sub wide-only">
            {prettyDate(isoDate(days[0]))} to {prettyDate(isoDate(days[days.length - 1]))}. Drag a job to move it.
          </p>
          <p className="page-sub phone-only">
            {prettyDate(isoDate(anchor))}. Tap a job below, or pick a day to schedule one.
          </p>
        </>
      }
      actions={
        <>
          <div className="row">
            <a className="btn btn-secondary btn-sm" href={shift(-1)} aria-label={`Previous ${view}`}>Back</a>
            <a className="btn btn-secondary btn-sm" href={`/calendar?view=${view}`}>Today</a>
            <a className="btn btn-secondary btn-sm" href={shift(1)} aria-label={`Next ${view}`}>Next</a>
          </div>
          <Tabs
            tabs={(["day", "week", "month"] as const).map((v) => ({
              key: v,
              name: v[0].toUpperCase() + v.slice(1),
              href: `/calendar?view=${v}&date=${dateParam}`,
            }))}
            active={view}
          />
          <a className="btn" href={`/jobs/new?start=${dateParam}T09:00`}>Schedule job</a>
        </>
      }
    >
      {view !== "day" ? (
        <div className="cal-heads phone-only">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
            <span key={name}>{name.slice(0, 1)}</span>
          ))}
        </div>
      ) : null}

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
              <span className="cal-date">
                <span className="cal-date-full">
                  {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                </span>
                <span className="cal-date-num">{day.getDate()}</span>
              </span>
              {items.map(({ job }) => (
                <a
                  key={job.id}
                  className="cal-event"
                  href={`/jobs/${job.id}`}
                  draggable
                  data-job={String(job.id)}
                  aria-label={job.title}
                >
                  <span className="cal-event-title">{job.title}</span>
                </a>
              ))}
              <a className="cal-add" href={`/jobs/new?start=${key}T09:00`}>Add job</a>
            </div>
          );
        })}
      </div>

      <div className="phone-only mt-2">
        <Card title="Scheduled work" note={agenda.length ? undefined : "Nothing booked in this range."} flush={agenda.length > 0}>
          {agenda.length ? (
            <ul className="rows">
              {agenda.map(({ job, customer }) => (
                <li key={job.id}>
                  <a className="row-item" href={`/jobs/${job.id}`}>
                    <span className="row-main">
                      <span className="row-title">{job.title}</span>
                      <span className="row-meta">
                        {prettyWhen(job.scheduledStart)} · {displayName(customer)}
                      </span>
                      <span className="row-badge"><Badge status={job.status} /></span>
                    </span>
                    <span className="row-side" />
                    <ChevronIcon />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      {unscheduled.length ? (
        <Card title="Not scheduled yet" note="Pick a time and these move onto the board." className="mt-2">
          {unscheduled.map(({ job, customer }) => (
            <form action={rescheduleJobAction} key={job.id} className="schedule-row mt-1">
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="next" value="/calendar" />
              <a className="grow" href={`/jobs/${job.id}`}>
                {job.title}
                <span className="tiny"> {displayName(customer)}</span>
              </a>
              <input className="input" type="datetime-local" name="scheduled_start" />
              <button className="btn btn-secondary btn-sm" type="submit">Schedule</button>
            </form>
          ))}
        </Card>
      ) : null}
    </Shell>
  );
}

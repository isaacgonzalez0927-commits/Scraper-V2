import { label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";

export function Money({ cents }: { cents: number }) {
  return <span className="money">{formatMoney(cents)}</span>;
}

export function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{label(status)}</span>;
}

/** Placeholder for a value the shop has not filled in. Never a dash. */
export function Blank({ text = "Not set" }: { text?: string }) {
  return <span className="muted">{text}</span>;
}

export function Banner({
  error,
  ok,
  info,
  warn,
  children,
  flush,
}: {
  error?: string;
  ok?: string;
  info?: string;
  warn?: string;
  children?: React.ReactNode;
  flush?: boolean;
}) {
  const text = error || ok || info || warn;
  if (!text && !children) return null;
  const tone = error ? "bad" : ok ? "good" : warn ? "warn" : "info";
  return (
    <div className={`banner banner-${tone}${flush ? " banner-flush" : ""}`}>
      <div>{text || children}</div>
    </div>
  );
}

export function Card({
  title,
  note,
  action,
  flush,
  className,
  children,
}: {
  title?: string;
  note?: string;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = ["card", flush ? "card-flush" : "", className || ""].filter(Boolean).join(" ");
  return (
    <section className={classes}>
      {title || action ? (
        <div className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {note ? <p className="card-note">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label: name,
  value,
  note,
  tone,
  small,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad" | "accent";
  small?: boolean;
}) {
  return (
    <article className={`card${tone ? ` stat-${tone}` : ""}`}>
      <p className="stat-label">{name}</p>
      <p className={`stat-value${small ? " stat-value-sm" : ""}`}>{value}</p>
      {note ? <p className="stat-note">{note}</p> : null}
    </article>
  );
}

export type Tab = { key: string; name: string; href: string; count?: number };

export function Tabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <nav className="tabs">
      {tabs.map((tab) => (
        <a key={tab.key} className={`tab${tab.key === active ? " active" : ""}`} href={tab.href}>
          {tab.name}
          {tab.count !== undefined ? <span className="tab-count">{tab.count}</span> : null}
        </a>
      ))}
    </nav>
  );
}

export function SearchField({
  name = "q",
  value,
  placeholder,
  hidden,
}: {
  name?: string;
  value?: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form className="row" method="get">
      {Object.entries(hidden || {}).map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}
      <div className="search-field">
        <SearchIcon />
        <input name={name} defaultValue={value} placeholder={placeholder} />
      </div>
      <button className="btn btn-secondary" type="submit">Search</button>
    </form>
  );
}

export function Empty({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {href && action ? <a className="btn" href={href}>{action}</a> : null}
    </div>
  );
}

export function KeyValue({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="kv">
      {rows.map(([key, value]) => (
        <div className="kv-row" key={key}>
          <span className="kv-key">{key}</span>
          <span className="kv-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

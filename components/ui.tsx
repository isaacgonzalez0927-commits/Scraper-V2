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
  id,
  children,
}: {
  title?: string;
  note?: string;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const classes = ["card", flush ? "card-flush" : "", className || ""].filter(Boolean).join(" ");
  return (
    <section className={classes} id={id}>
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
        <input
          name={name}
          type="search"
          defaultValue={value}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>
      <button className="btn btn-secondary search-submit" type="submit">Search</button>
    </form>
  );
}

export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="rows">{children}</ul>;
}

/**
 * A whole row is the tap target, not the few words inside it. On a phone a 20px
 * text link is a miss waiting to happen.
 */
export function RowLink({
  href,
  title,
  meta,
  badge,
  amount,
  amountNote,
  dim,
}: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  amount?: React.ReactNode;
  amountNote?: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <li>
      <a className={`row-item${dim ? " dim" : ""}`} href={href}>
        <span className="row-main">
          <span className="row-title">{title}</span>
          {meta ? <span className="row-meta">{meta}</span> : null}
          {badge ? <span className="row-badge">{badge}</span> : null}
        </span>
        <span className="row-side">
          {amount ? <span className="row-amount">{amount}</span> : null}
          {amountNote ? <span className="row-note">{amountNote}</span> : null}
        </span>
        <ChevronIcon />
      </a>
    </li>
  );
}

export type Column = { label: string; align?: "right" };

export type RecordRow = {
  key: string | number;
  href: string;
  /** Desktop cells, in the same order as the columns. */
  cells: React.ReactNode[];
  /** How the same record reads on a phone, where a seven column table cannot. */
  phone: {
    title: React.ReactNode;
    meta?: React.ReactNode;
    badge?: React.ReactNode;
    amount?: React.ReactNode;
    amountNote?: React.ReactNode;
  };
  dim?: boolean;
};

/**
 * One definition, two shapes: a table on a wide screen and a tappable list of
 * rows on a phone. Neither shape is a horizontally scrolling table, because
 * nobody reads one of those on a phone.
 */
export function RecordTable({ columns, records }: { columns: Column[]; records: RecordRow[] }) {
  return (
    <>
      <div className="card card-flush table-wrap wide-only">
        <table className="data">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label} className={column.align === "right" ? "right" : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.key} className={record.dim ? "void-row" : undefined}>
                {record.cells.map((cell, i) => (
                  <td key={columns[i]?.label || i} className={columns[i]?.align === "right" ? "right" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-flush phone-only">
        <Rows>
          {records.map((record) => (
            <RowLink key={record.key} href={record.href} dim={record.dim} {...record.phone} />
          ))}
        </Rows>
      </div>
    </>
  );
}

export function ChevronIcon() {
  return (
    <svg
      className="row-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
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

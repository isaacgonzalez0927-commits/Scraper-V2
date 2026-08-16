import { logoutAction } from "@/app/actions";

const NAV = [
  ["/overview", "Overview"],
  ["/jobs", "Jobs"],
  ["/customers", "Customers"],
  ["/invoices", "Invoices"],
  ["/payments", "Payments"],
  ["/calendar", "Calendar"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
] as const;

export function Shell({
  orgName,
  userName,
  unread,
  path,
  title,
  sub,
  actions,
  children,
}: {
  orgName: string;
  userName: string;
  unread: number;
  path: string;
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="/overview">
          <span className="brand-mark">S</span>
          <span className="brand-name">Sere</span>
        </a>
        <nav className="nav">
          {NAV.map(([href, name]) => (
            <a key={href} href={href} className={active(href) ? "active" : ""}>
              {name}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a className="org-chip" href="/settings">
            <strong>{orgName}</strong>
            <span>{userName}</span>
          </a>
          <form action={logoutAction}>
            <button className="btn btn-ghost btn-sm" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <header className="mobile-top">
        <button className="btn btn-ghost menu-toggle" type="button" data-toggle-nav>Menu</button>
        <a className="brand" href="/overview"><span className="brand-name">Sere</span></a>
        <button className="btn btn-ghost" type="button" data-open-search>Search</button>
      </header>
      <div className="app">
        <main className="main">
          <div className="topbar">
            <div>
              <h1 className="page-title">{title}</h1>
              {sub}
            </div>
            <div className="top-actions">
              <button className="search-btn" type="button" data-open-search>
                Search customers, jobs, invoices
                <kbd>⌘K</kbd>
              </button>
              <a className="btn btn-ghost" href="/notifications">
                Alerts{unread ? ` · ${unread}` : ""}
              </a>
              {actions}
            </div>
          </div>
          {children}
        </main>
      </div>
      <nav className="bottom-nav">
        <a href="/overview" className={active("/overview") ? "active" : ""}>Home</a>
        <a href="/jobs" className={active("/jobs") ? "active" : ""}>Jobs</a>
        <a href="/invoices" className={active("/invoices") ? "active" : ""}>Invoices</a>
        <a href="/payments" className={active("/payments") ? "active" : ""}>Cash</a>
        <a href="/settings" className={active("/settings") ? "active" : ""}>More</a>
      </nav>
      <div className="palette" id="search-palette">
        <div className="palette-panel">
          <input id="palette-input" placeholder="Search customers, jobs, invoices" />
          <div className="palette-results" id="palette-results" />
        </div>
      </div>
    </>
  );
}

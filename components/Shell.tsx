import { logoutAction } from "@/app/actions";
import { BrandLogo } from "@/components/BrandLogo";

const NAV = [
  ["/overview", "Overview", "grid"],
  ["/jobs", "Jobs", "briefcase"],
  ["/customers", "Customers", "users"],
  ["/invoices", "Invoices", "file"],
  ["/payments", "Payments", "card"],
  ["/calendar", "Calendar", "calendar"],
  ["/reports", "Reports", "chart"],
  ["/settings", "Settings", "settings"],
] as const;

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    users: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3" /><path d="M16 11a3 3 0 0 0 0-6M18 15.5a3.5 3.5 0 0 1 3 3.5v1" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.5A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5H15v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v2.6h-.1a1.7 1.7 0 0 0-1.5 1.4Z" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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
          <BrandLogo className="brand-lockup" />
        </a>
        <nav className="nav">
          {NAV.map(([href, name, icon]) => (
            <a key={href} href={href} className={active(href) ? "active" : ""}>
              <Icon name={icon} />
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
        <a className="brand" href="/overview">
          <BrandLogo className="brand-lockup" />
        </a>
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

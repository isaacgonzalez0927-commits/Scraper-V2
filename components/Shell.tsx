import { logoutAction } from "@/app/actions";
import { BrandLogo } from "@/components/BrandLogo";
import { SearchIcon } from "@/components/ui";

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

const BOTTOM_NAV = [
  ["/overview", "Home", "grid"],
  ["/jobs", "Jobs", "briefcase"],
  ["/calendar", "Calendar", "calendar"],
  ["/invoices", "Invoices", "file"],
  ["/settings", "Settings", "settings"],
] as const;

const PATHS: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A2 2 0 0 1 10.5 3.5h3a2 2 0 0 1 2 2V7M3 12h18" /></>,
  users: <><circle cx="9.5" cy="8" r="3.2" /><path d="M3.5 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M16.5 11a3 3 0 0 0 0-6M17 15h.5a4 4 0 0 1 4 4v1" /></>,
  file: <><path d="M6 3.5h7.5L18 8v12.5H6z" /><path d="M13.5 3.5V8H18M9 13h6M9 16.5h4" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M6.5 14.5h3.5" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="m7.5 15.5 3.5-4 3 2 4.5-6" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" /></>,
  bell: <><path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" /><path d="M9.5 18a2.5 2.5 0 0 0 5 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
};

/* Solid silhouettes for the selected tab, the way SF Symbols fill on iOS. */
const FILL: Record<string, React.ReactNode> = {
  grid: PATHS.grid,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A2 2 0 0 1 10.5 3.5h3a2 2 0 0 1 2 2V7" fill="none" stroke="currentColor" strokeWidth="1.7" /></>,
  file: <path d="M6 3.5h7.5L18 8v12.5H6z" />,
  card: <rect x="3" y="5" width="18" height="14" rx="2.5" />,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M8 3.5v4M16 3.5v4" fill="none" stroke="currentColor" strokeWidth="1.7" /></>,
  settings: <><circle cx="12" cy="12" r="8.2" opacity="0.22" /><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
};

export function Icon({
  name,
  className = "nav-icon",
  filled,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  const solid = Boolean(filled && FILL[name]);
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={solid ? "0" : "1.7"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {solid ? FILL[name] : PATHS[name]}
    </svg>
  );
}

export function Shell({
  orgName,
  userName,
  unread,
  isDemo,
  path,
  title,
  sub,
  actions,
  children,
}: {
  orgName: string;
  userName: string;
  unread: number;
  isDemo?: boolean;
  path: string;
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <div className="app">
      <aside className="sidebar" id="sidebar">
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
          {isDemo ? (
            <a className="demo-chip" href="/signup">
              <strong>Demo shop</strong>
              <span>Change anything. Create your own when you are ready.</span>
            </a>
          ) : null}
          <a className="org-chip" href="/settings">
            <strong>{orgName}</strong>
            <span>{userName}</span>
          </a>
          <form action={logoutAction}>
            <button className="btn btn-ghost btn-sm btn-block" type="submit">
              {isDemo ? "Leave the demo" : "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button
            className="icon-btn menu-toggle"
            type="button"
            data-toggle-nav
            aria-label="Open menu"
            aria-controls="sidebar"
            aria-expanded="false"
          >
            <Icon name="menu" className="" />
          </button>
          <a className="brand" href="/overview">
            <BrandLogo className="brand-lockup" />
          </a>
          <button className="search-btn" type="button" data-open-search aria-label="Search">
            <SearchIcon />
            <span>Search customers, jobs, invoices</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-right">
            <a className="icon-btn" href="/notifications" aria-label="Alerts">
              <Icon name="bell" className="" />
              {unread ? <span className="dot">{unread > 9 ? "9+" : unread}</span> : null}
            </a>
          </div>
        </header>

        <main className="main">
          <div className="page-head">
            <div>
              <h1 className="page-title">{title}</h1>
              {sub}
            </div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>

      <div className="scrim" data-close-nav />

      <nav className="bottom-nav" aria-label="Primary">
        {BOTTOM_NAV.map(([href, name, icon]) => {
          const on = active(href);
          return (
            <a key={href} href={href} className={on ? "active" : ""} aria-current={on ? "page" : undefined}>
              <Icon name={icon} className="" filled={on} />
              {name}
            </a>
          );
        })}
      </nav>

      <div className="palette" id="search-palette">
        <div className="palette-panel">
          <div className="palette-bar">
            <input
              id="palette-input"
              type="search"
              placeholder="Search customers, jobs, invoices"
              autoComplete="off"
              enterKeyHint="search"
            />
            <button className="palette-cancel" type="button" data-close-search>
              Cancel
            </button>
          </div>
          <div className="palette-results" id="palette-results" />
        </div>
      </div>
    </div>
  );
}

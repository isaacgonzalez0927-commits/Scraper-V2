import { Icon } from "@/components/Icon";
import { MobileNavigation } from "@/components/MobileNavigation";
import { logoutAction } from "@/app/actions";
import { AssistantDock } from "@/components/Assistant";
import { BrandLogo } from "@/components/BrandLogo";
import { SetupGuide } from "@/components/SetupGuide";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchIcon } from "@/components/ui";
import type { AssistantBrief } from "@/lib/assistant";
import type { SetupGuideView } from "@/lib/sere-setup";
import { shopModeBanner, type ShopMode } from "@/lib/shop-mode";

export { Icon } from "@/components/Icon";

export function Shell({
  orgName,
  userName,
  unread,
  isDemo,
  frozen,
  trialBanner,
  tradeName,
  worker,
  jobsLabel = "Jobs",
  customersLabel = "Customers",
  searchHint = "Search customers, jobs, invoices",
  brief,
  setup,
  shopMode,
  native,
  path,
  title,
  sub,
  actions,
  collectCount = 0,
  children,
}: {
  orgName: string;
  userName: string;
  unread: number;
  isDemo?: boolean;
  frozen?: boolean;
  trialBanner?: string;
  tradeName?: string;
  worker?: string;
  jobsLabel?: string;
  customersLabel?: string;
  searchHint?: string;
  brief?: AssistantBrief;
  setup?: { guide: SetupGuideView } | null;
  shopMode?: ShopMode;
  native?: boolean;
  collectCount?: number;
  path: string;
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const modeNote = !isDemo && shopMode ? shopModeBanner(shopMode) : null;
  const collectBadge = collectCount > 0 ? (collectCount > 9 ? "9+" : String(collectCount)) : "";
  const nav: [string, [string, string, string, string?][]][] = [
    ["Today", [["/overview", "Overview", "grid"],["/requests", "Requests", "file"],["/dispatch", "Dispatch", "calendar"],["/field", "Field work", "briefcase"],["/serenity", "Serenity", "spark"]]],
    ["Customers & work", [["/jobs", jobsLabel, "briefcase"],["/customers", customersLabel, "users"],["/estimates", "Estimates", "file"]]],
    ["Money", [["/collect", "Collect", "cash", collectBadge],["/invoices", "Invoices", "file"],["/payments", "Payments", "card"],["/reports", "Reports", "chart"]]],
  ];
  const business: [string,string,string][] = [["/team","Team","users"],["/agreements","Service plans","calendar"],["/equipment","Equipment","settings"],["/inventory","Inventory","grid"],["/automations","Follow-ups","spark"],["/calendar","Calendar","calendar"],["/settings","Settings","settings"]];
  return (
    <div className={`app${native ? " app-native" : ""}`} data-page={path.split("/")[1]}>
      <aside className="sidebar" id="sidebar">
        <a className="brand" href="/overview">
          <BrandLogo className="brand-lockup" />
        </a>
        <nav className="nav">
          {nav.map(([group,items]) => <div className="nav-group" key={group}><span className="nav-group-label">{group}</span>{items.map(([href,name,icon,count])=><a key={href} href={href} aria-current={active(href)?'page':undefined} className={active(href)?"active":""}><Icon name={icon}/>{name}{count?<span className="nav-count">{count}</span>:null}</a>)}</div>)}
          <details className="nav-business" open={business.some(([href])=>active(href))}><summary><Icon name="settings"/>Manage business</summary><div className="nav-group">{business.map(([href,name,icon])=><a key={href} href={href} aria-current={active(href)?'page':undefined} className={active(href)?'active':''}><Icon name={icon}/>{name}</a>)}</div></details>
        </nav>
        <div className="sidebar-foot">
          {isDemo ? (
            <a className="demo-chip" href="/signup">
              <strong>Demo shop</strong>
              <span>Change anything. Start your Shop trial when this feels useful.</span>
            </a>
          ) : null}
          <a className="org-chip" href="/settings">
            <strong>{orgName}</strong>
            <span>{tradeName ? `${tradeName} · ${userName}` : userName}</span>
          </a>
          {isDemo || setup?.guide.complete ? null : (
            <a className="sidebar-setup" href={`${path}?guide=open`}>
              Still open
            </a>
          )}
          <form action={logoutAction}>
            <button className="btn btn-ghost btn-sm btn-block" type="submit">
              {isDemo ? "Leave the demo" : "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="search-btn" type="button" data-open-search aria-label="Search">
            <SearchIcon />
            <span>{searchHint}</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-right">
            <details className="quick-create"><summary className="btn btn-sm">+ Create</summary><div><a href="/requests?new=1">Service request</a><a href="/jobs/new">Job</a><a href="/estimates/new">Estimate</a><a href="/invoices/new">Invoice</a><a href="/customers/new">Customer</a></div></details>
            <ThemeToggle />
            {brief ? <AssistantDock brief={brief} tradeName={tradeName || "shop"} /> : null}
            <a className="icon-btn" href="/notifications" aria-label="Alerts">
              <Icon name="bell" className="" />
              {unread ? <span className="dot">{unread > 9 ? "9+" : unread}</span> : null}
            </a>
          </div>
        </header>

        <MobileNavigation
          path={path} orgName={orgName} userName={userName} unread={unread}
          collectCount={collectCount} frozen={frozen}
          setup={!isDemo && setup && !setup.guide.complete ? {href:`${path}?guide=open`,remaining:setup.guide.total-setup.guide.done} : null}
          groups={[...nav.map(([name, items]) => ({ name, items: items.map(([href, label, icon, count]) => ({href, label, icon, count})) })), {name:"Manage business",items:business.map(([href,label,icon])=>({href,label,icon}))}]}
          account={<><ThemeToggle /><form action={logoutAction}><button className="btn btn-ghost" type="submit">{isDemo ? "Leave demo" : "Sign out"}</button></form></>}
        />

        <main className="main" id="main-content">
          {trialBanner && !isDemo ? (
            <a
              className={`trial-banner${frozen ? " trial-banner-ended" : ""}`}
              href="/settings?tab=account"
            >
              <strong>{trialBanner}</strong>
              <span>{frozen ? "Shop is $49/month when billing opens." : "Shop is $49/month after that."}</span>
            </a>
          ) : null}
          {modeNote ? (
            <a className={`mode-banner mode-banner-${modeNote.tone}`} href={modeNote.href}>
              <strong>{modeNote.title}</strong>
              {modeNote.body ? <span>{modeNote.body}</span> : null}
            </a>
          ) : null}
          {title || sub || actions || frozen ? (
          <div className="page-head">
            <div>
              {title ? <h1 className="page-title">{title}</h1> : null}
              {sub}
            </div>
            {frozen ? (
              <div className="page-actions">
                <a className="btn btn-secondary" href="/settings?tab=account">
                  Trial ended
                </a>
              </div>
            ) : actions ? (
              <div className="page-actions">{actions}</div>
            ) : null}
          </div>
          ) : null}
          {children}
        </main>
      </div>

      {setup && !isDemo ? <SetupGuide guide={setup.guide} /> : null}

      <dialog className="palette" id="search-palette" aria-label="Search your business">
        <div className="palette-panel">
          <div className="palette-bar">
            <input
              id="palette-input"
              aria-label={searchHint}
              type="search"
              placeholder={searchHint}
              autoComplete="off"
              enterKeyHint="search"
            />
            <button className="palette-cancel" type="button" data-close-search>
              Cancel
            </button>
          </div>
          <div className="palette-results" id="palette-results" aria-live="polite" />
        </div>
      </dialog>
    </div>
  );
}

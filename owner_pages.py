"""Owner-facing pages: dashboard, reports, history, statistics."""

from nexus_icons import NEXUS_ICON_LINKS, NEXUS_MANIFEST_ICONS

OWNER_HEAD = f"""
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f8f9fb">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Nexus">
<link rel="manifest" href="/manifest-owner.webmanifest">
{NEXUS_ICON_LINKS}
"""

THEME_JS = """
(function(){
  const KEY='ascend_theme';
  function apply(t){
    document.documentElement.dataset.theme=t;
    const m=document.querySelector('meta[name=theme-color]');
    if(m)m.content=t==='dark'?'#111827':'#f8f9fb';
    document.querySelectorAll('[data-theme-opt]').forEach(function(btn){
      var on=btn.getAttribute('data-theme-opt')===t;
      btn.classList.toggle('active',on);
      btn.setAttribute('aria-pressed',on?'true':'false');
    });
  }
  var saved=localStorage.getItem(KEY);
  apply(saved==='dark'?'dark':'light');
  document.querySelectorAll('[data-theme-opt]').forEach(function(btn){
    btn.onclick=function(){
      var theme=btn.getAttribute('data-theme-opt');
      localStorage.setItem(KEY,theme);apply(theme);
    };
  });
})();
"""

OWNER_STYLES = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#f8f9fb;--bg2:#fff;--card:#fff;--text:#111827;--muted:#6b7280;--border:#e5e7eb;
--accent:#7c3aed;--accent-subtle:#f3e8ff;--green:#059669;--green-bg:#ecfdf5;
--red:#dc2626;--amber:#b45309;--amber-bg:#fffbeb;--radius:8px;--shadow:0 1px 2px rgba(0,0,0,.05)
}
[data-theme="dark"]{
--bg:#111827;--bg2:#1f2937;--card:#1f2937;--text:#f9fafb;--muted:#9ca3af;--border:#374151;
--accent:#a78bfa;--accent-subtle:rgba(124,58,237,.18);--green-bg:rgba(5,150,105,.15);
--amber-bg:rgba(180,83,9,.15);--shadow:none
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
background:var(--bg);color:var(--text);padding:20px;max-width:1080px;margin:0 auto;line-height:1.5;font-size:15px}
a{color:var(--accent);text-decoration:none}
h1{font-size:1.375rem;font-weight:600;margin-bottom:4px}
.brand{font-size:.8125rem;font-weight:500;color:var(--muted);margin-bottom:16px}
.sub{color:var(--muted);font-size:.875rem;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
.card .num{font-size:1.5rem;font-weight:600;color:var(--text)}
.card .lbl{font-size:.75rem;color:var(--muted);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-size:.75rem;font-weight:600}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.filters select,.filters input{padding:9px 12px;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);color:var(--text);font-family:inherit;font-size:.875rem}
.filters button{padding:9px 16px;border-radius:var(--radius);border:none;background:var(--accent);
color:#fff;font-weight:500;cursor:pointer;font-family:inherit}
.report-box{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
padding:16px;margin-bottom:12px;box-shadow:var(--shadow)}
.report-box h3{margin-bottom:6px;font-size:.9375rem;font-weight:600}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:500}
.badge.dead{background:#fef2f2;color:var(--red)}
.badge.none{background:var(--amber-bg);color:var(--amber)}
.badge.client{background:var(--green-bg);color:var(--green)}
.badge.interested{background:var(--accent-subtle);color:var(--accent)}
.login{max-width:360px;margin:80px auto;text-align:center}
.login input{width:100%;padding:12px;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);color:var(--text);margin:12px 0;font-size:1rem}
.login button{width:100%;padding:12px;border:none;border-radius:var(--radius);background:var(--accent);
color:#fff;font-weight:500;cursor:pointer;font-family:inherit}
"""

NEXUS_NAV_CSS = """
:root{--bottom-nav-h:56px;--mobile-header-h:48px;--safe-bottom:env(safe-area-inset-bottom,0px);--safe-top:env(safe-area-inset-top,0px)}
.mobile-header,.bottom-nav{display:none}
.desktop-topbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;
margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.desktop-nav{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.desktop-nav a{padding:7px 12px;border-radius:var(--radius);border:1px solid var(--border);
font-size:.8125rem;font-weight:500;color:var(--muted);background:var(--card)}
.desktop-nav a:hover{color:var(--text)}
.desktop-nav a.active{background:var(--accent-subtle);border-color:var(--accent-subtle);color:var(--accent);font-weight:600}
.bottom-nav a.active{color:var(--accent);font-weight:600}
.theme-switch{display:flex;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:2px;gap:2px;flex-shrink:0}
.theme-switch button{flex:1;border:none;background:transparent;color:var(--muted);font-family:inherit;
font-size:.75rem;font-weight:500;padding:6px 10px;border-radius:6px;cursor:pointer;min-width:44px}
.theme-switch button.active{background:var(--card);color:var(--text);font-weight:600;box-shadow:var(--shadow)}
.mobile-header{align-items:center;justify-content:space-between;position:fixed;top:0;left:0;right:0;
height:calc(var(--mobile-header-h) + var(--safe-top));padding:var(--safe-top) 14px 0;background:var(--bg2);
border-bottom:1px solid var(--border);z-index:90}
.mobile-brand{font-size:1rem;font-weight:600}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;height:calc(var(--bottom-nav-h) + var(--safe-bottom));
padding-bottom:var(--safe-bottom);background:var(--bg2);border-top:1px solid var(--border);z-index:90}
.bottom-nav a{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);
font-size:.6875rem;font-weight:500;padding:8px 4px;text-align:center;line-height:1.2}
@media(max-width:768px){
body{padding:calc(var(--mobile-header-h) + var(--safe-top) + 8px) 0 calc(var(--bottom-nav-h) + var(--safe-bottom) + 16px)!important;max-width:none!important}
.mobile-header,.bottom-nav{display:flex}
.desktop-topbar{display:none}
.page-intro{padding-top:8px}
.page-intro .logo{display:none}
.wrap{padding:0 16px}
}
"""

NEXUS_MOBILE_HEADER = """
<header class="mobile-header">
  <div class="mobile-brand">Nexus</div>
  <div class="theme-switch" role="group" aria-label="Appearance">
    <button type="button" data-theme-opt="light" aria-pressed="true">Light</button>
    <button type="button" data-theme-opt="dark" aria-pressed="false">Dark</button>
  </div>
</header>
"""

NEXUS_DESKTOP_TOPBAR = """
<div class="desktop-topbar">
<nav class="desktop-nav">
  <a href="/" data-nav="calls">Call list</a>
  <a href="/dashboard" data-nav="dash">Dashboard</a>
  <a href="/reports" data-nav="reports">Reports</a>
  <a href="/history" data-nav="history">History</a>
  <a href="/stats" data-nav="stats">Statistics</a>
</nav>
<div class="theme-switch" role="group" aria-label="Appearance">
  <button type="button" data-theme-opt="light" aria-pressed="true">Light</button>
  <button type="button" data-theme-opt="dark" aria-pressed="false">Dark</button>
</div>
</div>
"""

NEXUS_BOTTOM_NAV = """
<nav class="bottom-nav">
  <a href="/" data-nav="calls">Calls</a>
  <a href="/dashboard" data-nav="dash">Home</a>
  <a href="/reports" data-nav="reports">Reports</a>
  <a href="/history" data-nav="history">History</a>
  <a href="/stats" data-nav="stats">Stats</a>
</nav>
"""

NEXUS_SHELL = NEXUS_MOBILE_HEADER + NEXUS_DESKTOP_TOPBAR + NEXUS_BOTTOM_NAV

OWNER_NAV = NEXUS_SHELL

OWNER_AUTH_JS = """
function ownerCode(){ return localStorage.getItem("nexus_owner_code") || ""; }
function setOwnerCode(c){ localStorage.setItem("nexus_owner_code", c); }
function ownerHeaders(){
  return {"X-Owner-Code": ownerCode(), "Content-Type": "application/json"};
}
async function ownerFetch(url){
  const code = ownerCode();
  if(!code){
    const c = prompt("Nexus owner access code:");
    if(!c) throw new Error("no code");
    setOwnerCode(c.trim());
  }
  const res = await fetch(url, {headers: ownerHeaders()});
  if(res.status === 401){
    localStorage.removeItem("nexus_owner_code");
    alert("Wrong owner code");
    location.reload();
    throw new Error("unauthorized");
  }
  return res.json();
}
function setActiveNav(key){
  document.querySelectorAll('[data-nav="'+key+'"]').forEach(function(el){
    el.classList.add('active');
  });
}
"""

DASHBOARD_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
{OWNER_HEAD}
<title>Nexus — Dashboard</title>
<style>{OWNER_STYLES}{NEXUS_NAV_CSS}</style></head><body>
{OWNER_NAV}
<div class="brand">Nexus</div>
<h1>Dashboard</h1>
<p class="sub">Live view of all calls Sebastien (and any caller) logs.</p>
<div class="grid" id="metrics"></div>
<h2 style="font-size:1.1rem;margin-bottom:12px">Lead type performance</h2>
<div class="grid" id="typePerf"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top cities</h2>
<div id="cities"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Recent activity</h2>
<table><thead><tr><th>When</th><th>Business</th><th>Type</th><th>Outcome</th><th>Score</th><th>Caller</th></tr></thead>
<tbody id="recent"></tbody></table>
<script>{OWNER_AUTH_JS}
setActiveNav("dash");
async function load(){{
  const d = await ownerFetch("/api/dashboard");
  const m = [
    ["Total calls", d.total], ["Interested", d.interested], ["Callbacks", d.callbacks],
    ["Clients", d.clients], ["Interest rate", d.interest_rate+"%"], ["Close rate", d.close_rate+"%"]
  ];
  document.getElementById("metrics").innerHTML = m.map(([l,n])=>
    `<div class="card"><div class="num">${{n}}</div><div class="lbl">${{l}}</div></div>`).join("");
  document.getElementById("typePerf").innerHTML = `
    <div class="card"><div class="num">${{d.dead_interest_rate}}%</div><div class="lbl">Dead — interest</div></div>
    <div class="card"><div class="num">${{d.dead_close_rate}}%</div><div class="lbl">Dead — close</div></div>
    <div class="card"><div class="num">${{d.no_interest_rate}}%</div><div class="lbl">No site — interest</div></div>
    <div class="card"><div class="num">${{d.no_close_rate}}%</div><div class="lbl">No site — close</div></div>`;
  document.getElementById("cities").innerHTML = (d.top_cities||[]).map(c=>
    `<div class="report-box"><b>${{c.city}}</b> — ${{c.calls}} calls · ${{c.interested}} interested · ${{c.clients}} clients</div>`
  ).join("") || "<p class=sub>No city data yet.</p>";
  document.getElementById("recent").innerHTML = (d.recent||[]).map(r=>`
    <tr><td>${{(r.logged_at||"").slice(0,16).replace("T"," ")}}</td>
    <td>${{r.business_name}}</td><td>${{r.lead_type}}</td>
    <td>${{r.outcome_label || r.outcome}}</td>
    <td>${{r.score??"—"}}</td><td>${{r.caller_id}}</td></tr>`).join("");
}}
load(); setInterval(load, 30000);
</script><script>{THEME_JS}</script></body></html>"""

REPORTS_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
{OWNER_HEAD}
<title>Nexus — Reports</title>
<style>{OWNER_STYLES}{NEXUS_NAV_CSS}</style></head><body>
{OWNER_NAV}
<div class="brand">Nexus</div>
<h1>Reports</h1>
<p class="sub">Auto-generated every 100 logged calls. Saved permanently.</p>
<div id="list"></div>
<script>{OWNER_AUTH_JS}
setActiveNav("reports");
async function load(){{
  const reports = await ownerFetch("/api/reports");
  if(!reports.length){{
    document.getElementById("list").innerHTML = "<p class=sub>No reports yet — first report at call #100.</p>";
    return;
  }}
  document.getElementById("list").innerHTML = reports.map(r=>`
    <div class="report-box">
      <h3>${{r.label}}</h3>
      <p class="sub">Generated ${{(r.generated_at||"").slice(0,10)}}</p>
      <div class="grid" style="margin-top:12px">
        <div class="card"><div class="num">${{r.total_calls}}</div><div class="lbl">Calls</div></div>
        <div class="card"><div class="num">${{r.interested}}</div><div class="lbl">Interested</div></div>
        <div class="card"><div class="num">${{r.clients}}</div><div class="lbl">Clients</div></div>
        <div class="card"><div class="num">${{r.interest_rate}}%</div><div class="lbl">Interest</div></div>
        <div class="card"><div class="num">${{r.close_rate}}%</div><div class="lbl">Close</div></div>
        <div class="card"><div class="num">${{r.dead_clients}}</div><div class="lbl">Dead→Client</div></div>
        <div class="card"><div class="num">${{r.no_clients}}</div><div class="lbl">No site→Client</div></div>
      </div>
    </div>`).join("");
}}
load();
</script><script>{THEME_JS}</script></body></html>"""

HISTORY_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
{OWNER_HEAD}
<title>Nexus — Call History</title>
<style>{OWNER_STYLES}{NEXUS_NAV_CSS}</style></head><body>
{OWNER_NAV}
<div class="brand">Nexus</div>
<h1>Call History</h1>
<p class="sub">Every outcome Sebastien enters appears here instantly.</p>
<div class="filters">
  <select id="fSite"><option value="">All types</option><option value="dead">Dead Website</option><option value="none">No Website</option></select>
  <select id="fOutcome"><option value="">All outcomes</option>
    <option value="no_answer">No answer</option><option value="interested">Interested</option>
    <option value="callback">Callback</option><option value="client">Client</option>
    <option value="not_interested">Not interested</option>
  </select>
  <input id="fCity" placeholder="Filter city..." style="padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:inherit">
  <button onclick="load()" style="padding:9px 16px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-weight:500;cursor:pointer;font-family:inherit">Apply</button>
</div>
<table><thead><tr><th>Business</th><th>Score</th><th>Type</th><th>Outcome</th><th>City</th><th>Date</th></tr></thead>
<tbody id="rows"></tbody></table>
<script>{OWNER_AUTH_JS}
setActiveNav("history");
async function load(){{
  const q = new URLSearchParams({{
    site_status: document.getElementById("fSite").value,
    outcome: document.getElementById("fOutcome").value,
    city: document.getElementById("fCity").value,
  }});
  const rows = await ownerFetch("/api/history?"+q);
  document.getElementById("rows").innerHTML = rows.map(r=>`
    <tr><td>${{r.business_name}}</td><td>${{r.score??"—"}}</td><td>${{r.lead_type}}</td>
    <td>${{r.outcome_label || r.outcome}}</td><td>${{r.city||"—"}}</td><td>${{r.date_called}}</td></tr>`
  ).join("") || "<tr><td colspan=6>No calls match filters.</td></tr>";
}}
load();
</script><script>{THEME_JS}</script></body></html>"""

STATS_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
{OWNER_HEAD}
<title>Nexus — Statistics</title>
<style>{OWNER_STYLES}{NEXUS_NAV_CSS}</style></head><body>
{OWNER_NAV}
<div class="brand">Nexus</div>
<h1>Statistics</h1>
<p class="sub">Conversion insights across cities and lead types.</p>
<div class="grid" id="summary"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top 10 cities — interest rate</h2>
<div id="topInt"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top 10 cities — close rate</h2>
<div id="topClose"></div>
<script>{OWNER_AUTH_JS}
setActiveNav("stats");
async function load(){{
  const s = await ownerFetch("/api/stats");
  document.getElementById("summary").innerHTML = `
    <div class="card"><div class="num">${{s.avg_score_interested}}</div><div class="lbl">Avg score (interested)</div></div>
    <div class="card"><div class="num">${{s.avg_score_client}}</div><div class="lbl">Avg score (clients)</div></div>
    <div class="card"><div class="num">${{s.dead_conversion}}%</div><div class="lbl">Dead → client</div></div>
    <div class="card"><div class="num">${{s.no_conversion}}%</div><div class="lbl">No site → client</div></div>
    <div class="card"><div class="num">${{s.dead_interest}}%</div><div class="lbl">Dead interest</div></div>
    <div class="card"><div class="num">${{s.no_interest}}%</div><div class="lbl">No site interest</div></div>`;
  const row = c => `<div class="report-box"><b>${{c.city}}</b> — ${{c.rate}}% (${{c.calls}} calls)</div>`;
  document.getElementById("topInt").innerHTML = (s.top_cities_interest||[]).map(row).join("") || "<p class=sub>Need 3+ calls per city.</p>";
  document.getElementById("topClose").innerHTML = (s.top_cities_close||[]).map(row).join("") || "<p class=sub>Need 3+ calls per city.</p>";
}}
load();
</script><script>{THEME_JS}</script></body></html>"""

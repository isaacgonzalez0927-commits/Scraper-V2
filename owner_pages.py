"""Owner-facing pages: dashboard, reports, history, statistics."""

from nexus_icons import NEXUS_ICON_LINKS
from nexus_theme import NEXUS_BASE_CSS, NEXUS_OWNER_CSS, NEXUS_VIEWPORT

OWNER_HEAD = f"""
<meta charset="UTF-8">
{NEXUS_VIEWPORT}
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
<style>{NEXUS_BASE_CSS}{NEXUS_OWNER_CSS}</style></head><body>
{OWNER_NAV}
<main class="main">
<div class="page-header">
<h1 class="hide-mobile">Dashboard</h1>
<p class="sub">Live view of all calls Sebastien (and any caller) logs.</p>
</div>
<div class="report-box" id="learnBox" style="margin-bottom:16px">
  <h3>Learning</h3>
  <p class="sub" id="learnStatus">Checking...</p>
</div>
<div class="report-box" style="margin-bottom:16px">
  <h3>Data backup</h3>
  <p class="sub">Download weekly — Render free tier can wipe data when the server restarts.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    <button type="button" id="backupBtn" style="padding:9px 16px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-weight:500;cursor:pointer;font-family:inherit">Download backup</button>
    <label style="padding:9px 16px;border-radius:8px;border:1px solid var(--border);background:var(--card);font-size:.875rem;cursor:pointer">
      Restore backup
      <input type="file" id="restoreFile" accept=".json,application/json" hidden>
    </label>
  </div>
</div>
<div class="grid" id="metrics"></div>
<h2 style="font-size:1.1rem;margin-bottom:12px">Lead type performance</h2>
<div class="grid" id="typePerf"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top cities</h2>
<div id="cities"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Recent activity</h2>
<table><thead><tr><th>When</th><th>Business</th><th>Type</th><th>Outcome</th><th>Score</th><th>Caller</th></tr></thead>
<tbody id="recent"></tbody></table>
</main>
<script>{OWNER_AUTH_JS}
setActiveNav("dash");
async function loadLearning(){{
  try {{
    const s = await ownerFetch("/api/learning");
    const el = document.getElementById("learnStatus");
    if(!s.active){{
      el.textContent = `Learning activates after ${{s.min_calls}} logged calls (${{s.total_calls}} so far).`;
      return;
    }}
    let txt = `Active — learning from ${{s.total_calls}} calls. Stats adjust every list for free.`;
    if(s.openai_enabled){{
      if(s.openai_cooldown_sec > 0)
        txt += ` AI boost on cooldown (${{Math.ceil(s.openai_cooldown_sec/3600)}}h left, saves API usage).`;
      else if(s.total_calls >= s.openai_min_calls)
        txt += " AI may refine top leads (max 1 call per 4 hours).";
      else
        txt += ` AI boost after ${{s.openai_min_calls}} calls.`;
    }}
    el.textContent = txt;
  }} catch(e) {{}}
}}
document.getElementById("backupBtn").onclick = async () => {{
  const data = await ownerFetch("/api/backup");
  const blob = new Blob([JSON.stringify(data, null, 2)], {{type:"application/json"}});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nexus-backup-" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
}};
document.getElementById("restoreFile").onchange = async (e) => {{
  const file = e.target.files[0];
  if(!file) return;
  if(!confirm("Replace ALL call data with this backup?")) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  const res = await fetch("/api/restore", {{
    method:"POST",
    headers: ownerHeaders(),
    body: JSON.stringify(payload)
  }});
  if(!res.ok){{ alert("Restore failed"); return; }}
  alert("Backup restored");
  load(); loadLearning();
}};
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
load(); loadLearning(); setInterval(load, 30000);
</script><script>{THEME_JS}</script></body></html>"""

REPORTS_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
{OWNER_HEAD}
<title>Nexus — Reports</title>
<style>{NEXUS_BASE_CSS}{NEXUS_OWNER_CSS}</style></head><body>
{OWNER_NAV}
<main class="main">
<div class="page-header">
<h1 class="hide-mobile">Reports</h1>
<p class="sub">Auto-generated every 100 logged calls. Saved permanently.</p>
</div>
<div id="list"></div>
</main>
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
<style>{NEXUS_BASE_CSS}{NEXUS_OWNER_CSS}</style></head><body>
{OWNER_NAV}
<main class="main">
<div class="page-header">
<h1 class="hide-mobile">Call History</h1>
<p class="sub">Every outcome Sebastien enters appears here instantly.</p>
</div>
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
</main>
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
<style>{NEXUS_BASE_CSS}{NEXUS_OWNER_CSS}</style></head><body>
{OWNER_NAV}
<main class="main">
<div class="page-header">
<h1 class="hide-mobile">Statistics</h1>
<p class="sub">Conversion insights across cities and lead types.</p>
</div>
<div class="grid" id="summary"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top 10 cities — interest rate</h2>
<div id="topInt"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top 10 cities — close rate</h2>
<div id="topClose"></div>
</main>
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

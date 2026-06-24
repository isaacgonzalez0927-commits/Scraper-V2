"""Owner-facing pages: dashboard, reports, history, statistics."""

OWNER_STYLES = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#04060d;--card:rgba(12,20,36,.9);--blue:#2563eb;--blue-l:#60a5fa;
--border:rgba(96,165,250,.14);--text:#f8fafc;--muted:#94a3b8;--green:#34d399;--red:#f87171}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);
padding:20px;max-width:1100px;margin:0 auto;line-height:1.5}
a{color:var(--blue-l);text-decoration:none}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
nav a{padding:8px 14px;border-radius:100px;border:1px solid var(--border);font-size:.85rem;font-weight:600}
nav a.active{background:var(--blue);border-color:var(--blue);color:#fff}
h1{font-size:1.5rem;margin-bottom:6px}
.sub{color:var(--muted);font-size:.9rem;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px}
.card .num{font-size:1.6rem;font-weight:800;color:var(--blue-l)}
.card .lbl{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-size:.72rem;text-transform:uppercase}
.filters{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.filters select{padding:10px 12px;border-radius:10px;border:1px solid var(--border);
background:rgba(255,255,255,.04);color:var(--text)}
.report-box{background:var(--card);border:1px solid var(--border);border-radius:14px;
padding:18px;margin-bottom:14px}
.report-box h3{margin-bottom:8px}
.badge{display:inline-block;padding:3px 10px;border-radius:100px;font-size:.72rem;font-weight:700}
.badge.dead{background:rgba(239,68,68,.15);color:#fca5a5}
.badge.none{background:rgba(251,191,36,.15);color:#fcd34d}
.badge.client{background:rgba(52,211,153,.15);color:#6ee7b7}
.badge.interested{background:rgba(96,165,250,.15);color:#93c5fd}
.login{max-width:360px;margin:80px auto;text-align:center}
.login input{width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);
background:rgba(255,255,255,.04);color:var(--text);margin:12px 0}
.login button{width:100%;padding:14px;border:none;border-radius:100px;background:var(--blue);
color:#fff;font-weight:700;cursor:pointer}
"""

OWNER_NAV = """
<nav>
  <a href="/dashboard" id="nav-dash">Dashboard</a>
  <a href="/reports" id="nav-reports">Reports</a>
  <a href="/history" id="nav-history">Call History</a>
  <a href="/stats" id="nav-stats">Statistics</a>
  <a href="/">Caller App</a>
</nav>
"""

OWNER_AUTH_JS = """
function ownerCode(){ return localStorage.getItem("owner_code") || ""; }
function setOwnerCode(c){ localStorage.setItem("owner_code", c); }
function ownerHeaders(){
  return {"X-Owner-Code": ownerCode(), "Content-Type": "application/json"};
}
async function ownerFetch(url){
  const code = ownerCode();
  if(!code){
    const c = prompt("Owner access code:");
    if(!c) throw new Error("no code");
    setOwnerCode(c.trim());
  }
  const res = await fetch(url, {headers: ownerHeaders()});
  if(res.status === 401){
    localStorage.removeItem("owner_code");
    alert("Wrong owner code");
    location.reload();
    throw new Error("unauthorized");
  }
  return res.json();
}
function setActiveNav(id){
  const el = document.getElementById(id);
  if(el) el.classList.add("active");
}
"""

DASHBOARD_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Owner Dashboard — Acsend</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{OWNER_STYLES}</style></head><body>
{OWNER_NAV}
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
setActiveNav("nav-dash");
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
    <td>${{r.business_name}}</td><td>${{r.lead_type}}</td><td>${{r.outcome}}</td>
    <td>${{r.score??"—"}}</td><td>${{r.caller_id}}</td></tr>`).join("");
}}
load(); setInterval(load, 30000);
</script></body></html>"""

REPORTS_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reports — Acsend</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>{OWNER_STYLES}</style></head><body>
{OWNER_NAV}
<h1>Reports</h1>
<p class="sub">Auto-generated every 100 logged calls. Saved permanently.</p>
<div id="list"></div>
<script>{OWNER_AUTH_JS}
setActiveNav("nav-reports");
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
</script></body></html>"""

HISTORY_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Call History — Acsend</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>{OWNER_STYLES}</style></head><body>
{OWNER_NAV}
<h1>Call History</h1>
<p class="sub">Every outcome Sebastien enters appears here instantly.</p>
<div class="filters">
  <select id="fSite"><option value="">All types</option><option value="dead">Dead Website</option><option value="none">No Website</option></select>
  <select id="fOutcome"><option value="">All outcomes</option>
    <option value="called">Called</option><option value="interested">Interested</option>
    <option value="callback">Callback</option><option value="client">Client</option>
    <option value="not_interested">Not interested</option><option value="no_answer">No answer</option>
  </select>
  <input id="fCity" placeholder="Filter city..." style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text)">
  <button onclick="load()" style="padding:10px 16px;border-radius:10px;border:none;background:var(--blue);color:#fff;font-weight:700;cursor:pointer">Apply</button>
</div>
<table><thead><tr><th>Business</th><th>Score</th><th>Type</th><th>Outcome</th><th>City</th><th>Date</th></tr></thead>
<tbody id="rows"></tbody></table>
<script>{OWNER_AUTH_JS}
setActiveNav("nav-history");
async function load(){{
  const q = new URLSearchParams({{
    site_status: document.getElementById("fSite").value,
    outcome: document.getElementById("fOutcome").value,
    city: document.getElementById("fCity").value,
  }});
  const rows = await ownerFetch("/api/history?"+q);
  document.getElementById("rows").innerHTML = rows.map(r=>`
    <tr><td>${{r.business_name}}</td><td>${{r.score??"—"}}</td><td>${{r.lead_type}}</td>
    <td>${{r.outcome}}</td><td>${{r.city||"—"}}</td><td>${{r.date_called}}</td></tr>`
  ).join("") || "<tr><td colspan=6>No calls match filters.</td></tr>";
}}
load();
</script></body></html>"""

STATS_PAGE = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Statistics — Acsend</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>{OWNER_STYLES}</style></head><body>
{OWNER_NAV}
<h1>Statistics</h1>
<p class="sub">Conversion insights across cities and lead types.</p>
<div class="grid" id="summary"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top 10 cities — interest rate</h2>
<div id="topInt"></div>
<h2 style="font-size:1.1rem;margin:20px 0 12px">Top 10 cities — close rate</h2>
<div id="topClose"></div>
<script>{OWNER_AUTH_JS}
setActiveNav("nav-stats");
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
</script></body></html>"""

#!/usr/bin/env python3
"""
Nexus — mobile call-list app for cold callers.

Your caller opens this on their phone, taps "Get My Call List", and gets
HVAC businesses with no website (or a dead one) ready to dial.
"""

from __future__ import annotations

import json
import os
import random
import re
import socket
import threading
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template_string, request, send_from_directory

import simple_scraper as engine
import tracking
from florida_cities import FLORIDA_CITIES
from nexus_icons import NEXUS_ICON_LINKS, NEXUS_MANIFEST_ICONS
from nexus_theme import NEXUS_BASE_CSS, NEXUS_CALLER_CSS, NEXUS_VIEWPORT
from owner_pages import (
    DASHBOARD_PAGE,
    HISTORY_PAGE,
    NEXUS_SHELL,
    REPORTS_PAGE,
    STATS_PAGE,
    THEME_JS,
)

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
HISTORY_FILE = HERE / "generated_history.json"
JOBS_DIR = HERE / "data" / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)

# Optional shared access code to protect the paid /generate endpoint.
# Set ACCESS_CODE in the environment (or .env) to require it. Empty = open.
ACCESS_CODE = os.getenv("ACCESS_CODE", "").strip()
OWNER_CODE = os.getenv("OWNER_CODE", "").strip()
CALLER_NAME = os.getenv("CALLER_NAME", "sebastien").strip()
RATE_LIMIT_SECONDS = int(os.getenv("RATE_LIMIT_SECONDS", "600"))

# In-memory job store: job_id -> {status, message, leads, error}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
LAST_GENERATE: dict[str, float] = {}


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


def rate_limit_key() -> str:
    code = (request.headers.get("X-Access-Code") or "").strip()
    return f"{request.remote_addr}:{code}"


def check_rate_limit() -> tuple[bool, int]:
    """Return (allowed, seconds_to_wait)."""
    key = rate_limit_key()
    now = time.time()
    with RATE_LOCK:
        last = LAST_GENERATE.get(key, 0)
        wait = int(RATE_LIMIT_SECONDS - (now - last))
        if wait > 0:
            return False, wait
        LAST_GENERATE[key] = now
        return True, 0


def check_owner() -> bool:
    if not OWNER_CODE:
        return True
    return (request.headers.get("X-Owner-Code") or "").strip() == OWNER_CODE


def check_caller() -> bool:
    if not ACCESS_CODE:
        return True
    return (request.headers.get("X-Access-Code") or "").strip() == ACCESS_CODE


# ---------------------------------------------------------------------------
# History (dedup across runs)
# ---------------------------------------------------------------------------


def load_history() -> set[str]:
    if not HISTORY_FILE.exists():
        return set()
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        return {normalize_phone(p) for p in data.get("phone_keys", []) if normalize_phone(p)}
    except (json.JSONDecodeError, OSError):
        return set()


def save_history(keys: set[str]) -> None:
    HISTORY_FILE.write_text(
        json.dumps({"phone_keys": sorted(keys)}, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Background pipeline
# ---------------------------------------------------------------------------


def set_job(job_id: str, **fields) -> None:
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {})
        JOBS[job_id].update(fields)
        try:
            (JOBS_DIR / f"{job_id}.json").write_text(
                json.dumps(JOBS[job_id]), encoding="utf-8"
            )
        except OSError:
            pass


def get_job(job_id: str) -> dict | None:
    with JOBS_LOCK:
        if job_id in JOBS:
            return JOBS[job_id]
    path = JOBS_DIR / f"{job_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        with JOBS_LOCK:
            JOBS[job_id] = data
        return data
    except (json.JSONDecodeError, OSError):
        return None


# Skip businesses with fewer reviews than this (filters out dead/empty profiles).
MIN_REVIEWS = 3


def run_pipeline(
    job_id: str,
    cities: list[str],
    top_n: int,
    extra_exclude: set[str],
    site_filter: str,
) -> None:
    def progress(message: str) -> None:
        set_job(job_id, message=message)

    try:
        set_job(job_id, status="running", message="Finding HVAC businesses...")

        # Same engine the command-line script uses, so results are identical.
        # The engine returns ONLY businesses that need a site (no/dead website).
        exclude = load_history() | extra_exclude
        rows = engine.collect_leads(
            cities,
            max_leads=top_n,
            pool_size=100,
            min_score=60,
            min_reviews=MIN_REVIEWS,
            use_openai=False,
            exclude_phones=exclude,
            progress=progress,
            opportunities_only=True,
            site_filter=site_filter,
        )

        if not rows:
            set_job(
                job_id,
                status="done",
                message="No high-scoring leads found. Try different cities.",
                leads=[],
            )
            return

        # Record these phones so future runs return new businesses.
        new_phones = {normalize_phone(r["phone"]) for r in rows if normalize_phone(r.get("phone", ""))}
        save_history(exclude | new_phones)

        payload = [
            {
                "name": r["name"],
                "phone": r["phone"],
                "rating": r["rating"],
                "reviews": r["reviews"],
                "website": r["website"] or "",
                "site_status": r["site_status"],
                "score": r["score"],
                "reason": r["reason"],
                "address": r["address"],
                "opener": engine.call_opener(r),
            }
            for r in rows
        ]
        set_job(job_id, status="done", message=f"Ready — {len(payload)} businesses to call.", leads=payload)
    except BaseException as exc:
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            raise
        set_job(job_id, status="error", error=str(exc), message=str(exc))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template_string(
        PAGE, cities=FLORIDA_CITIES, require_code=bool(ACCESS_CODE)
    )


@app.route("/manifest.webmanifest")
def manifest():
    return jsonify({
        "name": "Nexus",
        "short_name": "Nexus",
        "description": "Nexus — HVAC call lists for businesses that need a website.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#f8f9fb",
        "theme_color": "#f8f9fb",
        "icons": NEXUS_MANIFEST_ICONS,
    })


@app.route("/manifest-owner.webmanifest")
def manifest_owner():
    return jsonify({
        "name": "Nexus Dashboard",
        "short_name": "Nexus",
        "description": "Nexus owner dashboard — call tracking and reports.",
        "start_url": "/dashboard",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#f8f9fb",
        "theme_color": "#f8f9fb",
        "icons": NEXUS_MANIFEST_ICONS,
    })


@app.route("/apple-touch-icon.png")
@app.route("/apple-touch-icon-precomposed.png")
def apple_touch_icon():
    pref = (request.headers.get("Sec-CH-Prefers-Color-Scheme") or "").lower()
    name = "apple-touch-icon-dark.png" if pref == "dark" else "apple-touch-icon-light.png"
    return send_from_directory(app.static_folder, name)


@app.route("/favicon.ico")
def favicon():
    pref = (request.headers.get("Sec-CH-Prefers-Color-Scheme") or "").lower()
    name = "icon-192-dark.png" if pref == "dark" else "icon-192-light.png"
    return send_from_directory(app.static_folder, name)


@app.route("/generate", methods=["POST"])
def generate():
    if ACCESS_CODE:
        supplied = (request.headers.get("X-Access-Code") or "").strip()
        if supplied != ACCESS_CODE:
            return jsonify({"error": "unauthorized"}), 401

    if not os.getenv("GOOGLE_MAPS_API_KEY", "").strip():
        return jsonify({
            "error": "missing_api_key",
            "message": "Google Maps API key is not configured on the server.",
        }), 503

    allowed, wait = check_rate_limit()
    if not allowed:
        return jsonify({"error": "rate_limit", "retry_after": wait}), 429

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "random")
    count = max(3, min(int(data.get("count", 20)), 30))
    site_filter = data.get("site_filter", "all")
    if site_filter not in ("all", "dead", "none"):
        site_filter = "all"
    raw_exclude = data.get("exclude_phones") or []
    extra_exclude = {
        normalize_phone(p) for p in raw_exclude if normalize_phone(p)
    }

    if mode == "city" and data.get("city"):
        cities = [data["city"]]
    else:
        # Whole-state search: shuffle every Florida city so each run reaches a
        # different part of the state. collect_businesses stops once it has
        # enough fresh leads, so it won't grind through all 123 every time.
        cities = random.sample(FLORIDA_CITIES, k=len(FLORIDA_CITIES))

    job_id = uuid.uuid4().hex
    set_job(job_id, status="queued", message="Queued...", leads=None, error=None)

    thread = threading.Thread(
        target=run_pipeline,
        args=(job_id, cities, count, extra_exclude, site_filter),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id, "cities": cities})


@app.route("/status/<job_id>")
def status(job_id: str):
    job = get_job(job_id)
    if not job:
        return jsonify({"status": "unknown"}), 404
    return jsonify(job)


@app.route("/reset-history", methods=["POST"])
def reset_history():
    save_history(set())
    return jsonify({"ok": True})


@app.route("/api/log-call", methods=["POST"])
def api_log_call():
    if not check_caller():
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    outcome = (data.get("outcome") or "").strip().lower()
    try:
        result = tracking.log_call(
            caller_id=CALLER_NAME,
            business_name=data.get("business_name", ""),
            phone=data.get("phone", ""),
            score=data.get("score"),
            site_status=data.get("site_status", ""),
            address=data.get("address", ""),
            outcome=outcome,
            notes=data.get("notes", ""),
        )
        return jsonify({"ok": True, **result})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/dashboard")
def dashboard_page():
    return DASHBOARD_PAGE


@app.route("/reports")
def reports_page():
    return REPORTS_PAGE


@app.route("/history")
def history_page():
    return HISTORY_PAGE


@app.route("/stats")
def stats_page():
    return STATS_PAGE


@app.route("/api/dashboard")
def api_dashboard():
    if not check_owner():
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(tracking.dashboard_stats())


@app.route("/api/reports")
def api_reports():
    if not check_owner():
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(tracking.get_all_reports())


@app.route("/api/history")
def api_history():
    if not check_owner():
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(tracking.call_history(
        site_status=request.args.get("site_status", ""),
        outcome=request.args.get("outcome", ""),
        city=request.args.get("city", ""),
    ))


@app.route("/api/stats")
def api_stats():
    if not check_owner():
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(tracking.statistics_page())


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
""" + NEXUS_VIEWPORT + """
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Nexus">
<meta name="theme-color" content="#f8f9fb">
<title>Nexus</title>
<link rel="manifest" href="/manifest.webmanifest">
""" + NEXUS_ICON_LINKS + """
<style>
""" + NEXUS_BASE_CSS + NEXUS_CALLER_CSS + """
</style>
</head>
<body>
""" + NEXUS_SHELL + """
<main class="main">
  <div class="page-header">
    <h1 class="hide-mobile">Nexus</h1>
    <p class="tag">Call list for HVAC businesses without a working website</p>
  </div>

  <div class="panel">
    <div class="seg" id="seg">
      <button data-mode="random" class="active">Whole Florida</button>
      <button data-mode="city">Pick a city</button>
    </div>

    <div class="row" id="cityRow" style="display:none;margin-top:12px">
      <div class="field">
        <label>City</label>
        <select id="city">
          {% for c in cities %}<option value="{{c}}">{{c}}</option>{% endfor %}
        </select>
      </div>
    </div>

    <div class="row" style="margin-top:12px">
      <div class="field">
        <label>Lead type</label>
        <select id="siteFilter">
          <option value="all" selected>All (dead + no website)</option>
          <option value="dead">Dead websites only</option>
          <option value="none">No website only</option>
        </select>
      </div>
      <div class="field">
        <label>How many to call today</label>
        <select id="count">
          <option value="10">Up to 10</option>
          <option value="15">Up to 15</option>
          <option value="20" selected>Up to 20</option>
          <option value="30">Up to 30</option>
        </select>
      </div>
    </div>

    <button class="generate" id="genBtn">Get My Call List</button>
  </div>

  <div class="status" id="status">
    <div class="spinner"></div>
    <div class="msg" id="statusMsg">Working...</div>
  </div>

  <div class="results">
    <div class="results-bar" id="resultsBar">
      <button class="copybtn" id="copyBtn">Copy list</button>
      <div class="count-pill" id="countPill">0</div>
    </div>
    <div id="list"></div>
  </div>

  <button class="reset" id="resetBtn">Clear my history (show businesses again)</button>
</main>

<script>
let mode = "random";
let lastLeads = [];
const REQUIRE_CODE = {{ 'true' if require_code else 'false' }};

function historyKey(){
  const code = getCode();
  return code ? "nexus_used_" + code : "nexus_used_phones";
}
function calledKey(){
  const code = getCode();
  return code ? "nexus_called_" + code : "nexus_called_phones";
}
function normPhone(p){
  const d = (p||"").replace(/\D/g,"");
  return d.length >= 10 ? d.slice(-10) : d;
}
function loadUsedPhones(){
  try { return JSON.parse(localStorage.getItem(historyKey()) || "[]"); }
  catch(e){ return []; }
}
function saveUsedPhones(arr){
  localStorage.setItem(historyKey(), JSON.stringify(arr));
}
function loadCalledPhones(){
  try { return JSON.parse(localStorage.getItem(calledKey()) || "[]"); }
  catch(e){ return []; }
}
function saveCalledPhones(arr){
  localStorage.setItem(calledKey(), JSON.stringify(arr));
}
function isCalled(phone){
  return loadCalledPhones().includes(normPhone(phone));
}
function markCalled(phone){
  const key = normPhone(phone);
  if(!key) return;
  const set = new Set(loadCalledPhones());
  set.add(key);
  saveCalledPhones([...set]);
}

function getCode(){ return localStorage.getItem("nexus_code") || ""; }
function askCode(){
  const c = prompt("Enter your access code (ask your manager if you don't have one):");
  if(c){ localStorage.setItem("nexus_code", c.trim()); return c.trim(); }
  return "";
}

const seg = document.getElementById("seg");
seg.addEventListener("click", e => {
  const btn = e.target.closest("button");
  if(!btn) return;
  mode = btn.dataset.mode;
  [...seg.children].forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("cityRow").style.display = mode === "city" ? "flex" : "none";
});

const genBtn = document.getElementById("genBtn");
const statusEl = document.getElementById("status");
const statusMsg = document.getElementById("statusMsg");
const resultsBar = document.getElementById("resultsBar");
const list = document.getElementById("list");

genBtn.addEventListener("click", async () => {
  genBtn.disabled = true;
  genBtn.textContent = "Building list...";
  statusEl.classList.add("show");
  resultsBar.classList.remove("show");
  list.innerHTML = "";
  statusMsg.textContent = "Starting...";

  const body = {
    mode,
    city: document.getElementById("city").value,
    count: parseInt(document.getElementById("count").value, 10),
    site_filter: document.getElementById("siteFilter").value,
    exclude_phones: loadUsedPhones(),
  };

  let code = getCode();
  if(REQUIRE_CODE && !code){ code = askCode(); if(!code){ resetBtnState(); statusEl.classList.remove("show"); return; } }

  try {
    const res = await fetch("/generate", {
      method:"POST",
      headers:{"Content-Type":"application/json", "X-Access-Code": code},
      body:JSON.stringify(body)
    });
    if(res.status === 401){
      localStorage.removeItem("nexus_code");
      statusEl.classList.remove("show");
      list.innerHTML = '<div class="empty">Access code incorrect. Tap to try again.</div>';
      resetBtnState();
      return;
    }
    if(res.status === 503){
      const data = await res.json().catch(() => ({}));
      statusEl.classList.remove("show");
      list.innerHTML = '<div class="empty">'+(data.message||"Server is missing the Google Maps API key.")+'</div>';
      resetBtnState();
      return;
    }
    if(res.status === 429){
      const data = await res.json();
      const mins = Math.ceil((data.retry_after || 600) / 60);
      statusEl.classList.remove("show");
      list.innerHTML = '<div class="empty">Please wait ~'+mins+' min before generating another list (protects API limits).</div>';
      resetBtnState();
      return;
    }
    const { job_id } = await res.json();
    poll(job_id);
  } catch (err) {
    statusMsg.textContent = "Could not start — if this is the first load today, wait a minute and try again.";
    resetBtnState();
  }
});

function resetBtnState(){
  genBtn.disabled = false;
  genBtn.textContent = "Get My Call List";
}

async function poll(jobId, tries=0){
  try {
    const res = await fetch("/status/" + jobId);
    const job = await res.json().catch(() => ({}));
    if(job.message) statusMsg.textContent = job.message;

    if(res.status === 404 || job.status === "unknown"){
      if(tries < 8){
        setTimeout(() => poll(jobId, tries + 1), 2000);
        return;
      }
      statusEl.classList.remove("show");
      list.innerHTML = '<div class="empty">Lost connection to the server. Tap Get My Call List again.</div>';
      resetBtnState();
      return;
    }

    if(job.status === "done"){
      statusEl.classList.remove("show");
      const leads = job.leads || [];
      const used = new Set(loadUsedPhones());
      leads.forEach(l => { const k = normPhone(l.phone); if(k) used.add(k); });
      saveUsedPhones([...used]);
      render(leads);
      resetBtnState();
      return;
    }
    if(job.status === "error"){
      statusEl.classList.remove("show");
      list.innerHTML = '<div class="empty">'+(job.message||job.error||"Something went wrong.")+'</div>';
      resetBtnState();
      return;
    }
    if(tries > 200){
      statusEl.classList.remove("show");
      list.innerHTML = '<div class="empty">This is taking too long. Try again in a minute.</div>';
      resetBtnState();
      return;
    }
    setTimeout(() => poll(jobId, tries + 1), 1500);
  } catch (err){
    if(tries < 12){
      setTimeout(() => poll(jobId, tries + 1), 2500);
      return;
    }
    statusEl.classList.remove("show");
    list.innerHTML = '<div class="empty">Network error — check your connection and try again.</div>';
    resetBtnState();
  }
}

function render(leads){
  lastLeads = leads;
  if(!leads.length){
    list.innerHTML = '<div class="empty">No new businesses this round. Try another city, lead type, or clear history below.</div>';
    return;
  }
  const uncalled = leads.filter(l => !isCalled(l.phone)).length;
  document.getElementById("countPill").textContent = uncalled + " to call";
  resultsBar.classList.add("show");

  const statusText = {none: "NO WEBSITE", dead: "DEAD WEBSITE", working: "has website"};
  const outcomes = [
    ["no_answer","No answer"],["interested","Interested"],["callback","Callback"],
    ["client","Client"],["not_interested","Not interested"]
  ];
  list.innerHTML = leads.map((l, idx) => {
    const hot = l.score >= 60 ? "hot" : "";
    const rating = l.rating ? l.rating.toFixed(1) + " (" + l.reviews + ")" : l.reviews + " reviews";
    const status = statusText[l.site_status] || l.site_status || "";
    const site = l.website ? ' &middot; <a href="'+l.website+'" target="_blank">'+shortUrl(l.website)+'</a>' : "";
    const called = isCalled(l.phone);
    const opener = l.opener || "";
    const btns = outcomes.map(([k, label]) =>
      `<button type="button" class="outcome-btn" data-outcome="${k}" data-idx="${idx}">${label}</button>`
    ).join("");
    return `<div class="lead ${called ? "called" : ""}" data-idx="${idx}">
      <div class="lead-top">
        <div class="lead-name">${esc(l.name)}</div>
        <div class="score ${hot}">${l.score}</div>
      </div>
      <a class="phone" href="tel:${l.phone.replace(/[^0-9]/g,'')}">${esc(l.phone)}</a>
      <div class="meta"><b>${status}</b> &middot; ${rating}${site}</div>
      ${opener ? '<div class="opener">"'+esc(opener)+'"</div>' : ""}
      <div class="angle">${esc(l.reason||"")}</div>
      <div class="lead-actions">${btns}</div>
    </div>`;
  }).join("");

  list.querySelectorAll(".outcome-btn").forEach(btn => {
    btn.addEventListener("click", () => logOutcome(parseInt(btn.dataset.idx, 10), btn.dataset.outcome, btn));
  });
}

async function logOutcome(idx, outcome, btn){
  const lead = lastLeads[idx];
  if(!lead) return;
  const code = getCode();
  btn.disabled = true;
  try {
    await fetch("/api/log-call", {
      method:"POST",
      headers:{"Content-Type":"application/json", "X-Access-Code": code},
      body: JSON.stringify({
        business_name: lead.name,
        phone: lead.phone,
        score: lead.score,
        site_status: lead.site_status,
        address: lead.address || "",
        outcome: outcome
      })
    });
    markCalled(lead.phone);
    const card = btn.closest(".lead");
    card.classList.add("called");
    card.querySelectorAll(".outcome-btn").forEach(b => b.classList.remove("picked","client-pick"));
    btn.classList.add(outcome === "client" ? "client-pick" : "picked");
    const left = lastLeads.filter(l => !isCalled(l.phone)).length;
    document.getElementById("countPill").textContent = left + " to call";
  } catch(e) {
    btn.disabled = false;
    alert("Could not save outcome — check connection and try again.");
  }
}

function shortUrl(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch(e){ return u; } }
function esc(s){ return (s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

document.getElementById("copyBtn").addEventListener("click", () => {
  if(!lastLeads.length) return;
  const today = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
  let txt = "MY CALL LIST — " + today + "\n";
  txt += "Package: website build + hosting + monthly maintenance\n\n";
  const statusText = {none: "NO WEBSITE", dead: "DEAD WEBSITE", working: "has website"};
  lastLeads.forEach((l,i) => {
    const rating = l.rating ? l.rating.toFixed(1)+" stars ("+l.reviews+" reviews)" : l.reviews+" reviews";
    txt += (i+1)+") "+l.name+"  [score "+l.score+"]\n";
    txt += "   Phone: "+l.phone+"\n";
    txt += "   "+(statusText[l.site_status]||"")+" · "+rating+"\n";
    if(l.opener) txt += "   Say: \""+l.opener+"\"\n";
    if(l.reason) txt += "   Notes: "+l.reason+"\n";
    txt += "\n";
  });

  const btn = document.getElementById("copyBtn");
  const done = () => { btn.textContent="Copied!"; btn.classList.add("copied");
    setTimeout(()=>{btn.textContent="Copy list";btn.classList.remove("copied");},1800); };

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done).catch(()=>fallbackCopy(txt,done));
  } else { fallbackCopy(txt, done); }
});

function fallbackCopy(text, done){
  const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand("copy");done();}catch(e){alert("Copy failed — select manually.");}
  document.body.removeChild(ta);
}

document.getElementById("resetBtn").addEventListener("click", async () => {
  await fetch("/reset-history",{method:"POST"});
  localStorage.removeItem(historyKey());
  localStorage.removeItem(calledKey());
  document.getElementById("resetBtn").textContent = "History cleared";
  setTimeout(()=>{document.getElementById("resetBtn").textContent="Clear my history (show businesses again)";},1800);
});
</script>
</body>
</html>"""

PAGE = PAGE.replace(
    "</body>",
    '<script>document.querySelectorAll(\'[data-nav="calls"]\').forEach(function(el){el.classList.add("active");});</script>'
    f"<script>{THEME_JS}</script></body>",
    1,
)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    ip = local_ip()
    print("=" * 60)
    print("Nexus — call list for your cold caller")
    print("=" * 60)
    print(f"  On this computer : http://127.0.0.1:{port}")
    print(f"  On your phone    : http://{ip}:{port}   (same Wi-Fi)")
    if ACCESS_CODE:
        print("  Access code      : ENABLED (ACCESS_CODE set)")
    if OWNER_CODE:
        print(f"  Owner dashboard  : http://127.0.0.1:{port}/dashboard")
    else:
        print("  Owner dashboard  : set OWNER_CODE in .env to secure /dashboard")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

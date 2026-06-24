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
from flask import Flask, jsonify, render_template_string, request

import simple_scraper as engine
import tracking
from florida_cities import FLORIDA_CITIES
from owner_pages import DASHBOARD_PAGE, HISTORY_PAGE, REPORTS_PAGE, STATS_PAGE

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
HISTORY_FILE = HERE / "generated_history.json"

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
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
        set_job(job_id, status="error", error=str(exc), message=f"Error: {exc}")


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
        "background_color": "#0a0612",
        "theme_color": "#0a0612",
        "icons": [
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    })


@app.route("/generate", methods=["POST"])
def generate():
    if ACCESS_CODE:
        supplied = (request.headers.get("X-Access-Code") or "").strip()
        if supplied != ACCESS_CODE:
            return jsonify({"error": "unauthorized"}), 401

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
    with JOBS_LOCK:
        job = JOBS.get(job_id)
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
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Nexus">
<meta name="theme-color" content="#0a0612">
<title>Nexus</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/static/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#0a0612;--bg2:#120a1f;--card:rgba(18,10,32,.88);
--purple:#7c3aed;--purple-light:#a78bfa;--purple-bright:#c4b5fd;--purple-dark:#5b21b6;
--border:rgba(167,139,250,.16);--text:#f8fafc;--muted:#a8a3b8;--glow:rgba(124,58,237,.4);
}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);color:var(--text);
-webkit-font-smoothing:antialiased;min-height:100vh;padding:0 0 120px}
.bgglow{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.bgglow span{position:absolute;border-radius:50%;filter:blur(90px)}
.bgglow span:nth-child(1){width:380px;height:380px;background:rgba(124,58,237,.2);top:-120px;right:-80px}
.bgglow span:nth-child(2){width:320px;height:320px;background:rgba(91,33,182,.18);bottom:5%;left:-120px}
.wrap{position:relative;z-index:1;max-width:640px;margin:0 auto;padding:0 18px}
header{padding:calc(30px + env(safe-area-inset-top)) 0 16px;text-align:center}
.logo{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.6rem;letter-spacing:-.03em}
.logo span{background:linear-gradient(135deg,var(--purple-light),var(--purple-bright));
-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.tag{color:var(--muted);font-size:.85rem;margin-top:4px;line-height:1.45}
.steps{margin-top:14px;padding:14px 16px;border-radius:14px;background:rgba(124,58,237,.1);
border:1px solid var(--border);font-size:.82rem;color:var(--muted);line-height:1.6}
.steps strong{color:var(--purple-bright);font-weight:700}
.steps ol{margin:8px 0 0 18px;padding:0}
.steps li{margin-bottom:4px}
.cold-note{margin-top:10px;font-size:.78rem;color:var(--muted);font-style:italic}
.pitch{margin-top:14px;padding:14px 16px;border-radius:14px;background:rgba(124,58,237,.1);
border:1px solid var(--border);text-align:left}
.pitch summary{cursor:pointer;font-weight:700;color:var(--purple-bright);font-size:.85rem;list-style:none}
.pitch summary::-webkit-details-marker{display:none}
.pitch-body{margin-top:10px;font-size:.82rem;color:var(--muted);line-height:1.65}
.pitch-body p{margin-bottom:8px}
.pitch-body em{color:var(--text);font-style:normal;font-weight:600}

.panel{background:var(--card);border:1px solid var(--border);border-radius:18px;
padding:18px;margin-top:18px;backdrop-filter:blur(12px)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.field{flex:1;min-width:130px}
label{display:block;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
color:var(--purple-light);margin-bottom:6px}
select,input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--border);
background:rgba(255,255,255,.04);color:var(--text);font-family:inherit;font-size:.95rem;
appearance:none;-webkit-appearance:none}
select:focus,input:focus{outline:none;border-color:var(--purple-light)}
.seg{display:flex;background:rgba(255,255,255,.04);border:1px solid var(--border);
border-radius:12px;padding:4px;gap:4px}
.seg button{flex:1;padding:10px;border:none;background:transparent;color:var(--muted);
font-family:inherit;font-weight:700;font-size:.85rem;border-radius:9px;cursor:pointer}
.seg button.active{background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff}

.generate{width:100%;margin-top:6px;padding:18px;border:none;border-radius:100px;
background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;
font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.05rem;letter-spacing:-.01em;
box-shadow:0 6px 30px var(--glow);cursor:pointer;transition:transform .15s,box-shadow .15s}
.generate:active{transform:scale(.98)}
.generate:disabled{opacity:.55;box-shadow:none}

.status{display:none;margin-top:18px;align-items:center;gap:12px;
background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px}
.status.show{display:flex}
.spinner{width:22px;height:22px;border:3px solid rgba(167,139,250,.25);border-top-color:var(--purple-light);
border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.status .msg{font-size:.9rem;color:var(--muted)}

.results{margin-top:18px}
.results-bar{display:none;gap:10px;margin-bottom:14px}
.results-bar.show{display:flex}
.copybtn{flex:1;padding:15px;border:none;border-radius:100px;
background:linear-gradient(135deg,var(--purple-light),var(--purple));color:#04060d;
font-weight:800;font-family:'Bricolage Grotesque',sans-serif;font-size:.95rem;cursor:pointer}
.copybtn.copied{background:linear-gradient(135deg,#34d399,#10b981);color:#04221a}
.count-pill{background:rgba(124,58,237,.18);border:1px solid var(--border);color:var(--purple-bright);
border-radius:100px;padding:0 18px;display:flex;align-items:center;font-weight:700;font-size:.85rem;white-space:nowrap}

.lead{background:var(--card);border:1px solid var(--border);border-radius:16px;
padding:16px;margin-bottom:12px;transition:opacity .2s}
.lead.called{opacity:.45}
.lead-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.markbtn{padding:8px 14px;border-radius:100px;border:1px solid var(--border);
background:rgba(255,255,255,.04);color:var(--muted);font-size:.78rem;font-weight:700;cursor:pointer}
.markbtn.done{background:rgba(52,211,153,.15);border-color:rgba(52,211,153,.35);color:#6ee7b7}
.outcome-btn{padding:7px 10px;border-radius:100px;border:1px solid var(--border);
background:rgba(255,255,255,.04);color:var(--muted);font-size:.7rem;font-weight:700;cursor:pointer}
.outcome-btn:active{transform:scale(.97)}
.outcome-btn.picked{background:rgba(52,211,153,.2);border-color:rgba(52,211,153,.4);color:#6ee7b7}
.outcome-btn.client-pick{background:rgba(124,58,237,.28);border-color:var(--purple-light);color:var(--purple-bright)}
.opener{font-size:.84rem;line-height:1.5;color:var(--purple-bright);margin-bottom:8px;font-style:italic}
.lead-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
.lead-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.05rem;line-height:1.25}
.score{flex-shrink:0;width:46px;height:46px;border-radius:12px;display:flex;align-items:center;
justify-content:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.1rem;
background:rgba(124,58,237,.18);border:1px solid var(--border)}
.score.hot{background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;border:none}
.meta{font-size:.82rem;color:var(--muted);margin-bottom:10px}
.meta a{color:var(--purple-light)}
.phone{display:inline-block;font-weight:700;color:var(--text);font-size:1rem;margin-bottom:8px}
.angle{font-size:.88rem;line-height:1.55;margin-bottom:8px}
.gaps{display:flex;flex-wrap:wrap;gap:6px}
.gap{font-size:.7rem;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);
color:#fca5a5;border-radius:100px;padding:4px 10px}
.empty{text-align:center;color:var(--muted);padding:40px 10px;font-size:.9rem}
.reset{display:block;width:100%;margin-top:20px;background:none;border:none;color:var(--muted);
font-size:.78rem;text-decoration:underline;cursor:pointer}
</style>
</head>
<body>
<div class="bgglow"><span></span><span></span></div>
<div class="wrap">
  <header>
    <div class="logo"><span>Nexus</span></div>
    <div class="tag">Your dial list · HVAC shops with no website or a dead site</div>
    <div class="steps">
      <strong>How to use</strong>
      <ol>
        <li>Pick area and lead type below</li>
        <li>Tap <strong>Get My Call List</strong> and wait ~1–2 min</li>
        <li>Tap a <strong>phone number</strong> to call · tap an <strong>outcome</strong> when done</li>
      </ol>
      <div class="cold-note">First load of the day may take up to a minute — server is waking up.</div>
    </div>
    <details class="pitch">
      <summary>Your pitch script (tap to open)</summary>
      <div class="pitch-body">
        <p><em>Opener:</em> Use the line under each business — it's written for their situation.</p>
        <p><em>Then:</em> "We build modern websites for HVAC companies — design, hosting, and monthly maintenance. You don't have to do much; we pull your info from what's already online."</p>
        <p><em>Close:</em> "Would it be okay if I sent you a quick example of what your site could look like?"</p>
      </div>
    </details>
  </header>

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
</div>

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

async function poll(jobId){
  try {
    const res = await fetch("/status/" + jobId);
    const job = await res.json();
    if(job.message) statusMsg.textContent = job.message;

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
      list.innerHTML = '<div class="empty">'+(job.message||"Something went wrong.")+'</div>';
      resetBtnState();
      return;
    }
    setTimeout(() => poll(jobId), 1500);
  } catch (err){
    setTimeout(() => poll(jobId), 2500);
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
    ["called","Called"],["interested","Interested"],["callback","Callback"],
    ["client","Client"],["not_interested","No"],["no_answer","No ans"]
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

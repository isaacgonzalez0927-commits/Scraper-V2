#!/usr/bin/env python3
"""
Acsend Leads — mobile web app for cold callers.

Your caller opens this on their phone, taps "Get My Call List", and gets
HVAC businesses with no website (or a dead one) ready to dial.

Deploy on Render (see README) so they don't need your Wi-Fi.
"""

from __future__ import annotations

import json
import os
import random
import socket
import threading
import uuid
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template_string, request

import simple_scraper as engine
from florida_cities import FLORIDA_CITIES

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
HISTORY_FILE = HERE / "generated_history.json"

app = Flask(__name__)

# Optional shared access code to protect the paid /generate endpoint.
# Set ACCESS_CODE in the environment (or .env) to require it. Empty = open.
ACCESS_CODE = os.getenv("ACCESS_CODE", "").strip()

# In-memory job store: job_id -> {status, message, leads, error}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# History (dedup across runs)
# ---------------------------------------------------------------------------


def load_history() -> set[str]:
    if not HISTORY_FILE.exists():
        return set()
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        return set(data.get("phone_keys", []))
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
) -> None:
    def progress(message: str) -> None:
        set_job(job_id, message=message)

    try:
        set_job(job_id, status="running", message="Finding HVAC businesses...")

        # Same engine the command-line script uses, so results are identical.
        # The engine returns ONLY businesses that need a site (no/dead website).
        exclude = load_history()
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
        new_phones = {r["phone"] for r in rows if r.get("phone")}
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
        "name": "Acsend Call List",
        "short_name": "Call List",
        "description": "Build your HVAC call list — businesses that need a website.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#04060d",
        "theme_color": "#04060d",
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

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "random")
    count = max(3, min(int(data.get("count", 20)), 30))

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
        args=(job_id, cities, count),
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
<meta name="apple-mobile-web-app-title" content="Call List">
<meta name="theme-color" content="#04060d">
<title>Acsend Call List</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/static/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#04060d;--bg2:#080e1a;--card:rgba(12,20,36,.85);
--blue:#2563eb;--blue-light:#60a5fa;--blue-bright:#93c5fd;--blue-dark:#1d4ed8;
--border:rgba(96,165,250,.14);--text:#f8fafc;--muted:#94a3b8;--glow:rgba(37,99,235,.35);
}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);color:var(--text);
-webkit-font-smoothing:antialiased;min-height:100vh;padding:0 0 120px}
.bgglow{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.bgglow span{position:absolute;border-radius:50%;filter:blur(90px)}
.bgglow span:nth-child(1){width:380px;height:380px;background:rgba(37,99,235,.18);top:-120px;right:-80px}
.bgglow span:nth-child(2){width:320px;height:320px;background:rgba(29,78,216,.13);bottom:5%;left:-120px}
.wrap{position:relative;z-index:1;max-width:640px;margin:0 auto;padding:0 18px}
header{padding:calc(30px + env(safe-area-inset-top)) 0 16px;text-align:center}
.logo{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.6rem;letter-spacing:-.03em}
.logo span{background:linear-gradient(135deg,var(--blue-light),var(--blue-bright));
-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.tag{color:var(--muted);font-size:.85rem;margin-top:4px;line-height:1.45}
.steps{margin-top:14px;padding:14px 16px;border-radius:14px;background:rgba(37,99,235,.08);
border:1px solid var(--border);font-size:.82rem;color:var(--muted);line-height:1.6}
.steps strong{color:var(--blue-bright);font-weight:700}
.steps ol{margin:8px 0 0 18px;padding:0}
.steps li{margin-bottom:4px}

.panel{background:var(--card);border:1px solid var(--border);border-radius:18px;
padding:18px;margin-top:18px;backdrop-filter:blur(12px)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.field{flex:1;min-width:130px}
label{display:block;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
color:var(--blue-light);margin-bottom:6px}
select,input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--border);
background:rgba(255,255,255,.04);color:var(--text);font-family:inherit;font-size:.95rem;
appearance:none;-webkit-appearance:none}
select:focus,input:focus{outline:none;border-color:var(--blue-light)}
.seg{display:flex;background:rgba(255,255,255,.04);border:1px solid var(--border);
border-radius:12px;padding:4px;gap:4px}
.seg button{flex:1;padding:10px;border:none;background:transparent;color:var(--muted);
font-family:inherit;font-weight:700;font-size:.85rem;border-radius:9px;cursor:pointer}
.seg button.active{background:linear-gradient(135deg,var(--blue),var(--blue-dark));color:#fff}

.generate{width:100%;margin-top:6px;padding:18px;border:none;border-radius:100px;
background:linear-gradient(135deg,var(--blue),var(--blue-dark));color:#fff;
font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.05rem;letter-spacing:-.01em;
box-shadow:0 6px 30px var(--glow);cursor:pointer;transition:transform .15s,box-shadow .15s}
.generate:active{transform:scale(.98)}
.generate:disabled{opacity:.55;box-shadow:none}

.status{display:none;margin-top:18px;align-items:center;gap:12px;
background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px}
.status.show{display:flex}
.spinner{width:22px;height:22px;border:3px solid rgba(96,165,250,.25);border-top-color:var(--blue-light);
border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.status .msg{font-size:.9rem;color:var(--muted)}

.results{margin-top:18px}
.results-bar{display:none;gap:10px;margin-bottom:14px}
.results-bar.show{display:flex}
.copybtn{flex:1;padding:15px;border:none;border-radius:100px;
background:linear-gradient(135deg,var(--blue-light),var(--blue));color:#04060d;
font-weight:800;font-family:'Bricolage Grotesque',sans-serif;font-size:.95rem;cursor:pointer}
.copybtn.copied{background:linear-gradient(135deg,#34d399,#10b981);color:#04221a}
.count-pill{background:rgba(37,99,235,.15);border:1px solid var(--border);color:var(--blue-bright);
border-radius:100px;padding:0 18px;display:flex;align-items:center;font-weight:700;font-size:.85rem;white-space:nowrap}

.lead{background:var(--card);border:1px solid var(--border);border-radius:16px;
padding:16px;margin-bottom:12px}
.lead-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
.lead-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.05rem;line-height:1.25}
.score{flex-shrink:0;width:46px;height:46px;border-radius:12px;display:flex;align-items:center;
justify-content:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.1rem;
background:rgba(37,99,235,.15);border:1px solid var(--border)}
.score.hot{background:linear-gradient(135deg,var(--blue),var(--blue-dark));color:#fff;border:none}
.meta{font-size:.82rem;color:var(--muted);margin-bottom:10px}
.meta a{color:var(--blue-light)}
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
    <div class="logo">Acsend <span>Call List</span></div>
    <div class="tag">Your dial list · HVAC shops with no website or a dead site</div>
    <div class="steps">
      <strong>How to use</strong>
      <ol>
        <li>Pick <strong>Whole Florida</strong> or a city</li>
        <li>Tap <strong>Get My Call List</strong> and wait ~1–2 min</li>
        <li>Tap any <strong>phone number</strong> to call · use <strong>Copy list</strong> for notes</li>
      </ol>
    </div>
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

function getCode(){ return localStorage.getItem("acsend_code") || ""; }
function askCode(){
  const c = prompt("Enter your access code (ask your manager if you don't have one):");
  if(c){ localStorage.setItem("acsend_code", c.trim()); return c.trim(); }
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
  };

  let code = getCode();
  if(REQUIRE_CODE && !code){ code = askCode(); }

  try {
    const res = await fetch("/generate", {
      method:"POST",
      headers:{"Content-Type":"application/json", "X-Access-Code": code},
      body:JSON.stringify(body)
    });
    if(res.status === 401){
      localStorage.removeItem("acsend_code");
      statusEl.classList.remove("show");
      statusMsg.textContent = "Wrong access code.";
      list.innerHTML = '<div class="empty">Access code incorrect. Tap Generate to try again.</div>';
      resetBtnState();
      return;
    }
    const { job_id } = await res.json();
    poll(job_id);
  } catch (err) {
    statusMsg.textContent = "Could not start. Is the server running?";
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
      render(job.leads || []);
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
    list.innerHTML = '<div class="empty">No new businesses this round. Try another city or clear your history below.</div>';
    return;
  }
  document.getElementById("countPill").textContent = leads.length + " to call";
  resultsBar.classList.add("show");

  const statusText = {none: "NO WEBSITE", dead: "DEAD WEBSITE", working: "has website"};
  list.innerHTML = leads.map(l => {
    const hot = l.score >= 60 ? "hot" : "";
    const rating = l.rating ? l.rating.toFixed(1) + " (" + l.reviews + ")" : l.reviews + " reviews";
    const status = statusText[l.site_status] || l.site_status || "";
    const site = l.website ? ' &middot; <a href="'+l.website+'" target="_blank">'+shortUrl(l.website)+'</a>' : "";
    return `<div class="lead">
      <div class="lead-top">
        <div class="lead-name">${esc(l.name)}</div>
        <div class="score ${hot}">${l.score}</div>
      </div>
      <a class="phone" href="tel:${l.phone.replace(/[^0-9]/g,'')}">${esc(l.phone)}</a>
      <div class="meta"><b>${status}</b> &middot; ${rating}${site}</div>
      <div class="angle">${esc(l.reason||"")}</div>
    </div>`;
  }).join("");
}

function shortUrl(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch(e){ return u; } }
function esc(s){ return (s||"").replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

document.getElementById("copyBtn").addEventListener("click", () => {
  if(!lastLeads.length) return;
  const today = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
  let txt = "MY CALL LIST — " + today + "\n";
  txt += "Pitch: modern website + hosting + monthly maintenance\n\n";
  const statusText = {none: "NO WEBSITE", dead: "DEAD WEBSITE", working: "has website"};
  lastLeads.forEach((l,i) => {
    const rating = l.rating ? l.rating.toFixed(1)+" stars ("+l.reviews+" reviews)" : l.reviews+" reviews";
    txt += (i+1)+") "+l.name+"  [score "+l.score+"]\n";
    txt += "   Phone: "+l.phone+"\n";
    txt += "   "+(statusText[l.site_status]||"")+" \u00b7 "+rating+"\n";
    if(l.website) txt += "   Site: "+l.website+"\n";
    if(l.reason) txt += "   Why: "+l.reason+"\n";
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
    print("Acsend Call List — for your cold caller")
    print("=" * 60)
    print(f"  On this computer : http://127.0.0.1:{port}")
    print(f"  On your phone    : http://{ip}:{port}   (same Wi-Fi)")
    if ACCESS_CODE:
        print("  Access code      : ENABLED (ACCESS_CODE set)")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

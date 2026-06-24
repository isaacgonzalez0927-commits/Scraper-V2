#!/usr/bin/env python3
"""
Scraper V2 — Acsend Sites lead qualification engine.

The goal is NOT to find businesses with no website. The goal is to find the
businesses most likely to BENEFIT from Acsend and most likely to say yes:
strong reputation, active Google profile, but a weak or outdated web presence.

Pipeline:
  1. Google Places search   — collect full business data
  2. Website analysis        — score the current site (HTTPS, mobile, forms,
                               AI chat, speed, modern-design heuristics)
  3. Opportunity analysis    — OpenAI scores each lead 0-100 with a sales angle
  4. Ranking + export        — leads.csv, highest score first

Keys live in .env (gitignored):
  GOOGLE_MAPS_API_KEY=...
  OPENAI_API_KEY=...

Usage:
  python scraper_v2.py --cities "Port St. Lucie, FL" "Stuart, FL" --max-leads 20
  python scraper_v2.py --max-leads 40                 # uses florida_cities sample
  python scraper_v2.py --max-leads 10 --skip-ai       # cheap dry run, no OpenAI
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from florida_cities import FLORIDA_CITIES

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HERE = Path(__file__).parent

SEARCH_TERMS = [
    "HVAC contractor",
    "air conditioning repair",
    "heating and cooling company",
]

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_FIELD_MASK = (
    "places.id,places.displayName,places.nationalPhoneNumber,"
    "places.websiteUri,places.businessStatus,places.rating,"
    "places.userRatingCount,places.formattedAddress,places.googleMapsUri,"
    "places.types,nextPageToken"
)

# Place Details (New) — used to read review dates as a business-age signal
DETAILS_URL = "https://places.googleapis.com/v1/places/"
DETAILS_FIELD_MASK = "reviews.publishTime"

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"

# Web search used to verify a business truly has NO website, since Google Places
# only reports the site LINKED on the profile (often missing). We use the public
# DuckDuckGo HTML endpoint — no API key, account, or billing required.
SEARCH_URL = "https://html.duckduckgo.com/html/"

# Hostnames that are directories / social / manufacturer locators — NOT a
# business's own website. If only these show up, the business has no real site.
DIRECTORY_DOMAINS = (
    "facebook.", "instagram.", "yelp.", "yellowpages.", "bbb.org", "mapquest.",
    "angi.", "angieslist.", "nextdoor.", "thumbtack.", "homeadvisor.", "manta.",
    "indeed.", "linkedin.", "tiktok.", "youtube.", "google.", "pinterest.",
    "twitter.", "x.com", "wikipedia.", "reddit.", "justdial.", "bark.com",
    "businessyab.", "chamberofcommerce.", "buildzoom.", "porch.com", "houzz.",
    "expertise.", "birdeye.", "foursquare.", "cylex", "superpages.", "dexknows.",
    "citysearch.", "merchantcircle.", "hotfrog.", "brownbook.", "ezlocal.",
    "yellowbook.", "opendi.", "networx.", "fixr.", "trustpilot.", "glassdoor.",
    "ziprecruiter.", "local.com", "n49.", "apple.com", "amazon.", "trane.com",
    "carrier.com", "lennox.com", "goodman", "rheem.", "bryant.", "fieldroutes.",
    "getjobber.", "gaf.com", "mapcarta.", "loc8nearme.", "zaubacorp.",
)

# Generic HVAC words that don't help match a business to its domain.
_GENERIC_NAME_WORDS = {
    "air", "conditioning", "conditioner", "heating", "cooling", "hvac", "ac",
    "llc", "inc", "co", "company", "corp", "services", "service", "the", "and",
    "of", "fl", "florida", "repair", "refrigeration", "mechanical", "solutions",
    "systems", "comfort", "climate", "control", "professional", "quality",
    "best", "all", "pro", "experts", "expert", "guys", "team", "home",
}

REQUEST_DELAY_SEC = 2.0
MAX_PAGES_PER_QUERY = 3  # Text Search (New) returns up to ~60 results (3 pages)
WEBSITE_TIMEOUT_SEC = 12
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

LEADS_CSV = HERE / "leads.csv"
LEADS_JSON = HERE / "leads_v2.json"

# Known third-party live-chat / AI-support widget fingerprints
CHAT_WIDGET_SIGNATURES = (
    "intercom", "drift.com", "tawk.to", "livechatinc", "tidio",
    "crisp.chat", "zendesk", "zdassets", "hubspot", "freshchat",
    "olark", "gorgias", "podium", "birdeye", "manychat", "chatbot",
    "voiceflow", "landbot", "smartsupp", "userlike", "liveperson",
)

# Modern framework / build-tool fingerprints (suggests an up-to-date site)
MODERN_STACK_SIGNATURES = (
    "react", "next.js", "_next/", "nuxt", "vue", "svelte", "gatsby",
    "tailwind", "wp-content/themes/astra", "elementor", "webflow",
    "squarespace", "wix.com", "framer", "shopify",
)

# Dated tech that usually signals an old build
LEGACY_STACK_SIGNATURES = (
    "frontpage", "flash", "table width=", "<font", "marquee",
    "godaddy website builder", "wix free", "jimdo", "weebly",
)


@dataclass
class Lead:
    name: str
    phone: str = ""
    website: str = ""
    rating: float | None = None
    review_count: int = 0
    address: str = ""
    profile_url: str = ""
    place_id: str = ""
    types: list[str] = field(default_factory=list)

    # Website analysis
    website_exists: bool = False
    website_linked_on_google: bool = False
    https_enabled: bool = False
    mobile_friendly: bool = False
    contact_form_present: bool = False
    load_seconds: float | None = None
    ai_chat_present: bool = False
    modern_design_score: int = 0
    website_quality_score: int = 0
    analysis_notes: str = ""

    # Business age (estimated from earliest visible Google review)
    age_years: float | None = None
    first_review_date: str = ""

    # AI qualification
    score: int = 0
    confidence: str = ""
    reasoning: str = ""
    sales_angle: str = ""
    weaknesses: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Keys
# ---------------------------------------------------------------------------


def load_keys() -> tuple[str, str]:
    load_dotenv(HERE / ".env")
    g = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    o = os.getenv("OPENAI_API_KEY", "").strip()
    if not g:
        sys.exit("Error: GOOGLE_MAPS_API_KEY missing from lead-finder/.env")
    return g, o


def _emit(progress, message: str) -> None:
    """Send a status message to an optional progress callback."""
    if progress is not None:
        try:
            progress(message)
        except Exception:
            pass


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return phone.strip()


def phone_key(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


# ---------------------------------------------------------------------------
# Step 1 — Google Places search
# ---------------------------------------------------------------------------


def places_search(query: str, api_key: str, page_token: str | None = None) -> dict:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
    }
    body: dict = {"textQuery": query, "maxResultCount": 20}
    if page_token:
        body["pageToken"] = page_token

    resp = requests.post(PLACES_URL, headers=headers, json=body, timeout=30)
    if resp.status_code == 429:
        raise RuntimeError("Google Places daily quota hit. Try again tomorrow.")
    if not resp.ok:
        raise RuntimeError(f"Places search failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json()


def estimate_age_years(place_id: str, api_key: str) -> tuple[float | None, str]:
    """Estimate how long a business has existed from its earliest visible review.

    Place Details (New) returns up to 5 of the most-relevant reviews. The oldest
    review timestamp is a *lower bound* on age: the business is at least that old.
    Returns (age_in_years, iso_date) or (None, "") when no review data is found.
    """
    if not place_id:
        return None, ""
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    }
    try:
        resp = requests.get(DETAILS_URL + place_id, headers=headers, timeout=20)
        if not resp.ok:
            return None, ""
        reviews = resp.json().get("reviews") or []
    except (requests.RequestException, ValueError):
        return None, ""

    earliest: datetime | None = None
    for review in reviews:
        stamp = review.get("publishTime")
        if not stamp:
            continue
        try:
            dt = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError:
            continue
        if earliest is None or dt < earliest:
            earliest = dt

    if earliest is None:
        return None, ""
    age = (datetime.now(timezone.utc) - earliest).days / 365.25
    return round(age, 1), earliest.date().isoformat()


# ---------------------------------------------------------------------------
# Website verification (Custom Search) — confirm "no website" is really true
# ---------------------------------------------------------------------------


def _distinctive_tokens(name: str) -> list[str]:
    """Pull the non-generic words from a business name to match against a domain.

    e.g. "Seacoast Air Conditioning" -> ["seacoast"]; the HVAC words are dropped.
    """
    toks = re.findall(r"[a-z]+", name.lower())
    return [t for t in toks if len(t) >= 3 and t not in _GENERIC_NAME_WORDS]


def _locality(address: str) -> str:
    """Extract a 'City, ST' style hint from a formatted address for the query."""
    parts = [p.strip() for p in address.split(",") if p.strip()]
    # Typical: "123 Main St, Stuart, FL 34994, USA" -> use the middle pieces.
    if len(parts) >= 3:
        return f"{parts[-3]}, {parts[-2]}"
    return address.strip()


def _ddg_search(query: str, max_results: int = 12) -> list[str]:
    """Run a keyless web search via DuckDuckGo's HTML endpoint.

    Returns a list of result URLs. DuckDuckGo wraps each result link as
    /l/?uddg=<url-encoded-target>, so we extract and decode those targets.
    """
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
    try:
        resp = requests.post(
            SEARCH_URL, data={"q": query}, headers=headers, timeout=20
        )
        if not resp.ok:
            return []
        html = resp.text
    except requests.RequestException:
        return []

    urls: list[str] = []
    for match in re.finditer(r"uddg=([^&\"']+)", html):
        decoded = urllib.parse.unquote(match.group(1))
        if decoded.startswith("http"):
            urls.append(decoded)
        if len(urls) >= max_results:
            break
    return urls


def find_real_website(name: str, address: str) -> tuple[bool, str]:
    """Search the web to see if a business has its OWN website.

    Returns (has_website, url). Directory/social results don't count. We match a
    result domain to the business by looking for a distinctive name token in the
    hostname. Fail-safe: on any error or ambiguity, returns (False, "") so the
    lead is kept rather than wrongly dropped.
    """
    tokens = _distinctive_tokens(name)
    if not tokens:
        return False, ""

    query = f"{name} {_locality(address)}".strip()
    for url in _ddg_search(query):
        host = urllib.parse.urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        if not host or any(d in host for d in DIRECTORY_DOMAINS):
            continue
        # Merge the hostname into a single comparable string (drop dots/hyphens).
        core = host.replace("-", "").replace(".", "")
        if any(tok in core for tok in tokens):
            return True, url

    return False, ""


def keep_verified_no_website(
    leads: list[Lead],
    top_n: int,
    progress=None,
) -> list[Lead]:
    """Filter a ranked list down to leads with a verified absence of a website.

    Walks the ranked list (best first) and runs one web search per lead, dropping
    any that actually have their own site, until top_n remain.
    """
    kept: list[Lead] = []
    for i, lead in enumerate(leads, 1):
        if len(kept) >= top_n:
            break
        _emit(progress, f"Verifying no website {i}/{len(leads)}: {lead.name}")
        has_site, url = find_real_website(lead.name, lead.address)
        if has_site:
            print(f"  x dropped {lead.name} — found a real site: {url}")
            continue
        kept.append(lead)
        time.sleep(1.0)  # be gentle on the keyless endpoint

    return kept[:top_n]


def collect_businesses(
    cities: list[str],
    api_key: str,
    max_leads: int,
    min_reviews: int,
    exclude_keys: set[str] | None = None,
    progress=None,
    require_no_website: bool = False,
    max_reviews: int | None = None,
    min_age_years: float | None = None,
    max_age_years: float | None = None,
) -> list[Lead]:
    leads: dict[str, Lead] = {}
    exclude_keys = exclude_keys or set()
    queries = [f"{term} {city}" for city in cities for term in SEARCH_TERMS]
    check_age = min_age_years is not None or max_age_years is not None

    _emit(progress, f"Searching {len(queries)} queries across {len(cities)} cities")
    print(f"Step 1: searching {len(queries)} queries across {len(cities)} cities\n")

    for i, query in enumerate(queries, 1):
        if len(leads) >= max_leads:
            break
        print(f"  [{i}/{len(queries)}] {query}")
        _emit(progress, f"Searching: {query}  ({len(leads)}/{max_leads} found)")

        page_token: str | None = None
        for _page in range(MAX_PAGES_PER_QUERY):
            if len(leads) >= max_leads:
                break
            try:
                data = places_search(query, api_key, page_token)
            except RuntimeError as exc:
                print(f"    ! {exc}")
                _emit(progress, f"Search stopped: {exc}")
                return list(leads.values())

            for place in data.get("places", []):
                if len(leads) >= max_leads:
                    break
                if place.get("businessStatus") and place["businessStatus"] != "OPERATIONAL":
                    continue

                phone_raw = (place.get("nationalPhoneNumber") or "").strip()
                if not phone_raw:
                    continue

                key = phone_key(normalize_phone(phone_raw))
                if not key or key in leads or key in exclude_keys:
                    continue

                if require_no_website and (place.get("websiteUri") or "").strip():
                    continue

                review_count = int(place.get("userRatingCount") or 0)
                if review_count < min_reviews:
                    continue
                if max_reviews is not None and review_count > max_reviews:
                    continue

                age_years: float | None = None
                first_review_date = ""
                if check_age:
                    age_years, first_review_date = estimate_age_years(
                        place.get("id", ""), api_key
                    )
                    # Only exclude when we actually have a date to judge by.
                    # No review data -> keep the lead (review-count band still applies).
                    if age_years is not None:
                        if min_age_years is not None and age_years < min_age_years:
                            continue
                        if max_age_years is not None and age_years > max_age_years:
                            continue

                rating = place.get("rating")
                leads[key] = Lead(
                    name=(place.get("displayName") or {}).get("text", "").strip(),
                    phone=normalize_phone(phone_raw),
                    website=(place.get("websiteUri") or "").strip(),
                    rating=float(rating) if rating is not None else None,
                    review_count=review_count,
                    address=(place.get("formattedAddress") or "").strip(),
                    profile_url=(place.get("googleMapsUri") or "").strip(),
                    place_id=place.get("id", ""),
                    types=list(place.get("types") or []),
                    age_years=age_years,
                    first_review_date=first_review_date,
                )

            page_token = data.get("nextPageToken")
            if not page_token:
                break
            time.sleep(REQUEST_DELAY_SEC)

        time.sleep(REQUEST_DELAY_SEC)

    print(f"\n  Collected {len(leads)} qualifying businesses (min {min_reviews} reviews)\n")
    return list(leads.values())


# ---------------------------------------------------------------------------
# Step 2 — Website analysis
# ---------------------------------------------------------------------------


def analyze_website(lead: Lead) -> None:
    """Populate the website-analysis fields on the lead in place."""
    notes: list[str] = []
    url = lead.website

    if not url:
        lead.website_exists = False
        lead.analysis_notes = "No website on Google profile."
        lead.website_quality_score = 0
        lead.modern_design_score = 0
        return

    lead.website_linked_on_google = True
    lead.https_enabled = url.lower().startswith("https://")

    try:
        start = time.time()
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=WEBSITE_TIMEOUT_SEC,
            allow_redirects=True,
        )
        lead.load_seconds = round(time.time() - start, 2)
        final_url = resp.url
        lead.https_enabled = final_url.lower().startswith("https://")
        html = resp.text if resp.ok else ""
    except requests.RequestException as exc:
        lead.website_exists = False
        lead.analysis_notes = f"Website link present but did not load: {type(exc).__name__}"
        lead.website_quality_score = 5
        return

    if not html:
        lead.website_exists = False
        lead.analysis_notes = "Website returned no usable content."
        lead.website_quality_score = 5
        return

    lead.website_exists = True
    low = html.lower()

    # Mobile friendly: responsive viewport meta tag
    lead.mobile_friendly = bool(re.search(r'<meta[^>]+name=["\']viewport["\']', low))

    # Contact form / direct contact path
    lead.contact_form_present = bool(
        "<form" in low or "mailto:" in low or re.search(r'type=["\']email["\']', low)
    )

    # AI / live chat widget
    lead.ai_chat_present = any(sig in low for sig in CHAT_WIDGET_SIGNATURES)

    # Modern design heuristic (0-100)
    design = 40
    if lead.mobile_friendly:
        design += 20
    if lead.https_enabled:
        design += 10
    if any(sig in low for sig in MODERN_STACK_SIGNATURES):
        design += 20
    if any(sig in low for sig in LEGACY_STACK_SIGNATURES):
        design -= 30
    if lead.load_seconds is not None and lead.load_seconds > 5:
        design -= 15
    if "<style" in low or "stylesheet" in low:
        design += 5
    lead.modern_design_score = max(0, min(design, 100))

    # Overall website quality (0-100)
    quality = 0
    quality += 25 if lead.https_enabled else 0
    quality += 25 if lead.mobile_friendly else 0
    quality += 15 if lead.contact_form_present else 0
    quality += 10 if lead.ai_chat_present else 0
    quality += int(lead.modern_design_score * 0.25)
    if lead.load_seconds is not None and lead.load_seconds <= 3:
        quality += 5
    lead.website_quality_score = max(0, min(quality, 100))

    if not lead.mobile_friendly:
        notes.append("not mobile friendly")
    if not lead.https_enabled:
        notes.append("no HTTPS")
    if not lead.contact_form_present:
        notes.append("no contact form")
    if not lead.ai_chat_present:
        notes.append("no AI/live chat")
    if lead.load_seconds is not None and lead.load_seconds > 5:
        notes.append(f"slow load ({lead.load_seconds}s)")
    lead.analysis_notes = ", ".join(notes) if notes else "site is reasonably modern"


def analyze_all(leads: list[Lead], progress=None) -> None:
    print(f"Step 2: analyzing {len(leads)} websites\n")
    for i, lead in enumerate(leads, 1):
        print(f"  [{i}/{len(leads)}] {lead.name}")
        _emit(progress, f"Analyzing site {i}/{len(leads)}: {lead.name}")
        analyze_website(lead)
        site = lead.website or "no site"
        print(
            f"    site={site[:48]} | quality={lead.website_quality_score} "
            f"| design={lead.modern_design_score} | {lead.analysis_notes}"
        )
    print()


# ---------------------------------------------------------------------------
# Step 3 — Opportunity analysis (OpenAI)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a lead qualification engine for Acsend Sites.

Acsend sells to local businesses:
- Website redesigns and improvements
- High-converting landing pages
- AI customer support / chat
- Fast website updates and ongoing maintenance

Your job: score how likely a business is to BENEFIT from Acsend AND say yes.
Score 0-100. The best leads have a strong real-world reputation but a weak,
outdated, or missing online presence.

Score HIGHER when the business has:
- High review counts and an active Google profile
- A strong reputation but weak/outdated/missing website
- Poor mobile experience, weak design, no HTTPS
- No contact form, no AI/live chat
- Website missing or not linked on Google profile
- Signs of growth and demand

Score LOWER when the business:
- Already has a modern, fast, mobile-friendly website
- Already uses AI chat/support
- Shows advanced marketing or strong SEO/optimization
- Appears heavily optimized already

Return STRICT JSON only, no prose, with this exact shape:
{
  "score": <int 0-100>,
  "confidence": "<low|medium|high>",
  "reasoning": "<2-3 sentence explanation>",
  "sales_angle": "<one concrete pitch tailored to this business>",
  "weaknesses": ["<weakness>", "<weakness>", "<weakness>"]
}"""


def build_user_payload(lead: Lead) -> str:
    return json.dumps(
        {
            "business_name": lead.name,
            "phone": lead.phone,
            "rating": lead.rating,
            "review_count": lead.review_count,
            "estimated_age_years": lead.age_years,
            "address": lead.address,
            "google_profile_types": lead.types,
            "website": lead.website or None,
            "website_exists": lead.website_exists,
            "website_linked_on_google": lead.website_linked_on_google,
            "https_enabled": lead.https_enabled,
            "mobile_friendly": lead.mobile_friendly,
            "contact_form_present": lead.contact_form_present,
            "ai_chat_present": lead.ai_chat_present,
            "load_seconds": lead.load_seconds,
            "modern_design_score_0_100": lead.modern_design_score,
            "website_quality_score_0_100": lead.website_quality_score,
            "analysis_notes": lead.analysis_notes,
        },
        ensure_ascii=False,
    )


def qualify_with_openai(lead: Lead, api_key: str, model: str) -> None:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_payload(lead)},
        ],
    }

    resp = requests.post(OPENAI_URL, headers=headers, json=body, timeout=60)
    if not resp.ok:
        raise RuntimeError(f"OpenAI failed ({resp.status_code}): {resp.text[:300]}")

    content = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(content)

    lead.score = int(data.get("score", 0))
    lead.confidence = str(data.get("confidence", "")).strip()
    lead.reasoning = str(data.get("reasoning", "")).strip()
    lead.sales_angle = str(data.get("sales_angle", "")).strip()
    weaknesses = data.get("weaknesses", [])
    lead.weaknesses = [str(w).strip() for w in weaknesses if str(w).strip()]


def heuristic_score(lead: Lead) -> None:
    """Fallback scoring when OpenAI is skipped — keeps the pipeline usable."""
    score = 0
    score += min(lead.review_count, 100) // 2
    if lead.rating is not None:
        score += int(lead.rating * 5)
    score += max(0, 60 - lead.website_quality_score) // 2
    if not lead.website_exists:
        score += 15
    if not lead.mobile_friendly:
        score += 10
    if not lead.ai_chat_present:
        score += 5
    lead.score = max(0, min(score, 100))
    lead.confidence = "heuristic"
    lead.reasoning = "Computed locally (OpenAI skipped)."
    lead.sales_angle = (
        "Modernize their site and add AI support to match their reputation."
    )
    lead.weaknesses = [w.strip() for w in lead.analysis_notes.split(",") if w.strip()]


def qualify_all(leads: list[Lead], api_key: str, model: str, skip_ai: bool, progress=None) -> None:
    if skip_ai or not api_key:
        if not api_key and not skip_ai:
            print("Step 3: OPENAI_API_KEY missing — using heuristic scoring\n")
        else:
            print("Step 3: --skip-ai set — using heuristic scoring\n")
        _emit(progress, "Scoring leads (local heuristic)")
        for lead in leads:
            heuristic_score(lead)
        return

    print(f"Step 3: qualifying {len(leads)} leads with OpenAI ({model})\n")
    for i, lead in enumerate(leads, 1):
        _emit(progress, f"Scoring lead {i}/{len(leads)}: {lead.name}")
        try:
            qualify_with_openai(lead, api_key, model)
            print(f"  [{i}/{len(leads)}] {lead.score:3d} | {lead.name} — {lead.sales_angle[:60]}")
        except (RuntimeError, KeyError, json.JSONDecodeError) as exc:
            print(f"  [{i}/{len(leads)}] AI error on {lead.name}: {exc} — using heuristic")
            heuristic_score(lead)
        time.sleep(0.5)
    print()


# ---------------------------------------------------------------------------
# Step 3b — Batch ranking (research the whole pool, keep the best N)
# ---------------------------------------------------------------------------

RANK_SYSTEM_PROMPT = """You are a lead-qualification analyst for Acsend Sites.

Acsend builds modern, high-converting websites with built-in AI customer support
for local HVAC businesses. EVERY business in the list below currently has NO
website at all — they run entirely off their Google Business Profile, so they
are losing online customers a competitor could capture.

Your job: review the whole list and pick the BEST businesses to cold-call. The
ideal prospect is a real, active, well-regarded HVAC company that clearly has
demand but no website to convert it.

Rank a business HIGHER when it shows:
- A solid, believable review volume (proves real, ongoing demand)
- A strong star rating (good reputation we can showcase on a new site)
- Signs of a legitimate, multi-service HVAC operation
- Enough scale to afford and clearly benefit from a website

Rank a business LOWER when it shows:
- Very few reviews (likely brand-new, tiny, or inactive)
- A weak or low star rating (reputation problems; harder to sell and to help)
- Signals it may not really be a serious HVAC service business

You are scoring relative to the whole list. Return STRICT JSON only, no prose:
{
  "leads": [
    {
      "id": <int copied from the input>,
      "score": <int 0-100>,
      "confidence": "<low|medium|high>",
      "reasoning": "<1-2 sentences on why this is or isn't a great call>",
      "sales_angle": "<one concrete opening pitch for the cold caller>",
      "weaknesses": ["<gap Acsend can fix>", "<gap>"]
    }
  ]
}
Include ONLY the best businesses, ranked best first, no more than the number
requested in the user message."""


def build_rank_payload(leads: list[Lead], top_n: int) -> str:
    businesses = [
        {
            "id": i,
            "name": lead.name,
            "rating": lead.rating,
            "review_count": lead.review_count,
            "address": lead.address,
            "services": lead.types,
        }
        for i, lead in enumerate(leads)
    ]
    return json.dumps(
        {
            "instruction": (
                f"From these {len(leads)} HVAC businesses (all with no website), "
                f"pick the {top_n} best prospects for Acsend to cold-call."
            ),
            "businesses": businesses,
        },
        ensure_ascii=False,
    )


def rank_with_openai(
    leads: list[Lead],
    api_key: str,
    model: str,
    top_n: int,
    progress=None,
) -> list[Lead]:
    """Send the whole pool to OpenAI in one call and return the top N leads.

    Falls back to local heuristic ranking if OpenAI is unavailable or fails.
    """
    if not leads:
        return []

    def _fallback() -> list[Lead]:
        for lead in leads:
            heuristic_score(lead)
        leads.sort(key=lambda x: (-x.score, -x.review_count, x.name.lower()))
        return leads[:top_n]

    if not api_key:
        print("Step 3: OPENAI_API_KEY missing — using heuristic ranking\n")
        _emit(progress, "Scoring leads (local heuristic)")
        return _fallback()

    _emit(progress, f"OpenAI researching {len(leads)} businesses, picking top {top_n}...")
    print(f"Step 3: ranking {len(leads)} businesses with OpenAI ({model}), keeping {top_n}\n")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": RANK_SYSTEM_PROMPT},
            {"role": "user", "content": build_rank_payload(leads, top_n)},
        ],
    }

    try:
        resp = requests.post(OPENAI_URL, headers=headers, json=body, timeout=120)
        if not resp.ok:
            raise RuntimeError(f"OpenAI failed ({resp.status_code}): {resp.text[:300]}")
        content = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
    except (requests.RequestException, RuntimeError, KeyError, json.JSONDecodeError) as exc:
        print(f"  ! OpenAI ranking failed: {exc} — using heuristic\n")
        _emit(progress, "OpenAI unavailable — using local ranking")
        return _fallback()

    chosen: list[Lead] = []
    seen: set[int] = set()
    for entry in data.get("leads", []):
        try:
            idx = int(entry["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if idx in seen or not (0 <= idx < len(leads)):
            continue
        seen.add(idx)
        lead = leads[idx]
        lead.score = int(entry.get("score", 0))
        lead.confidence = str(entry.get("confidence", "")).strip()
        lead.reasoning = str(entry.get("reasoning", "")).strip()
        lead.sales_angle = str(entry.get("sales_angle", "")).strip()
        weaknesses = entry.get("weaknesses", [])
        lead.weaknesses = [str(w).strip() for w in weaknesses if str(w).strip()]
        chosen.append(lead)

    if not chosen:
        print("  ! OpenAI returned no usable picks — using heuristic\n")
        return _fallback()

    chosen.sort(key=lambda x: (-x.score, -x.review_count, x.name.lower()))
    return chosen[:top_n]


# ---------------------------------------------------------------------------
# Step 4 — Ranking + export
# ---------------------------------------------------------------------------


def export(leads: list[Lead]) -> None:
    leads.sort(key=lambda x: (-x.score, -x.review_count, x.name.lower()))

    with LEADS_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "Business Name", "Phone", "Website", "Rating", "Reviews", "Est. Age (yrs)",
            "Score", "Confidence", "Sales Angle", "Weaknesses",
            "Website Quality", "Address", "Google Profile",
        ])
        for lead in leads:
            writer.writerow([
                lead.name,
                lead.phone,
                lead.website or "NONE",
                f"{lead.rating:.1f}" if lead.rating is not None else "",
                lead.review_count,
                lead.age_years if lead.age_years is not None else "",
                lead.score,
                lead.confidence,
                lead.sales_angle,
                "; ".join(lead.weaknesses),
                lead.website_quality_score,
                lead.address,
                lead.profile_url,
            ])

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(leads),
        "leads": [asdict(lead) for lead in leads],
    }
    LEADS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Acsend Scraper V2 — lead qualification")
    parser.add_argument(
        "--cities",
        nargs="*",
        default=None,
        help="Cities to search (default: first 5 from florida_cities)",
    )
    parser.add_argument("--max-leads", type=int, default=25, help="Cap businesses analyzed")
    parser.add_argument("--min-reviews", type=int, default=5, help="Minimum Google reviews")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="OpenAI model")
    parser.add_argument("--skip-ai", action="store_true", help="Use heuristic scoring only")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    google_key, openai_key = load_keys()

    cities = args.cities if args.cities else FLORIDA_CITIES[:5]

    print("=" * 64)
    print("Acsend Scraper V2 — find the best-fit clients, not just no-website")
    print("=" * 64)
    print(f"Cities: {len(cities)} | Max leads: {args.max_leads} | Min reviews: {args.min_reviews}\n")

    leads = collect_businesses(cities, google_key, args.max_leads, args.min_reviews)
    if not leads:
        print("No qualifying businesses found.")
        return

    analyze_all(leads)
    qualify_all(leads, openai_key, args.model, args.skip_ai)
    export(leads)

    print("=" * 64)
    print(f"Done. {len(leads)} leads ranked.")
    print(f"  CSV : {LEADS_CSV.name}")
    print(f"  JSON: {LEADS_JSON.name}")
    print("\nTop 5:")
    for lead in leads[:5]:
        print(f"  {lead.score:3d} | {lead.name} | {lead.phone} | {lead.sales_angle[:50]}")


if __name__ == "__main__":
    main()

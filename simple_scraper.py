#!/usr/bin/env python3
"""
Simple HVAC lead scraper — Google Places + rubric scoring.

What it does, in plain steps:
  1. Searches Google Places for HVAC businesses in the cities you list.
  2. Checks whether each one ACTUALLY has a working website (opens the link).
  3. Scores each lead 0-100 with a fixed rubric (site need + reviews + rating).
  4. Saves everything to leads.csv, best leads first.

How to run:
    python simple_scraper.py

Edit the CITIES and MAX_LEADS settings just below to change what it searches.
Your keys live in .env (GOOGLE_MAPS_API_KEY and OPENAI_API_KEY).
"""

from __future__ import annotations

import csv
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# SETTINGS — change these, nothing else needed
# ---------------------------------------------------------------------------

CITIES = [
    "Stuart, FL",
    "Port St. Lucie, FL",
    "Vero Beach, FL",
    "Fort Pierce, FL",
]

SEARCH_TERMS = ["HVAC contractor", "air conditioning repair"]

MAX_LEADS = 20          # how many high-quality leads to deliver
SCAN_POOL = 100         # businesses to scan before narrowing down
MIN_SCORE = 60          # only deliver leads at or above this score
MIN_REVIEWS = 3         # skip businesses with fewer reviews than this
USE_OPENAI = False      # scoring uses the rubric below (fast + consistent)

# Scoring rubric (max 100):
#   Site opportunity (no/dead website)  50 pts
#   Reviews                             0-20 pts
#   Rating                              0-15 pts
#   Business legitimacy                 0-15 pts

# ---------------------------------------------------------------------------

HERE = Path(__file__).parent
OUTPUT_CSV = HERE / "leads.csv"

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.displayName,places.nationalPhoneNumber,places.websiteUri,"
    "places.rating,places.userRatingCount,places.formattedAddress,"
    "places.businessStatus"
)
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
CHECK_WORKERS = 10        # parallel website checks
_SPAM_NAME = re.compile(
    r"(24/7|24 hour|#\d|cheapest|cheap|best price|top rated|call now|free estimate)",
    re.I,
)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def load_keys() -> tuple[str, str]:
    load_dotenv(HERE / ".env")
    google = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    openai = os.getenv("OPENAI_API_KEY", "").strip()
    if not google:
        raise SystemExit("Missing GOOGLE_MAPS_API_KEY in .env")
    return google, openai


def search_places(query: str, api_key: str, max_pages: int = 2) -> list[dict]:
    """Return business records from Google Places for one query.

    Pages through results (20 per page) so we also reach the less-prominent
    businesses — which is exactly where the no-website shops tend to be.
    """
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK + ",nextPageToken",
    }
    out: list[dict] = []
    page_token = None
    for _ in range(max_pages):
        body: dict = {"textQuery": query, "maxResultCount": 20}
        if page_token:
            body["pageToken"] = page_token
        resp = requests.post(PLACES_URL, headers=headers, json=body, timeout=30)
        if not resp.ok:
            print(f"  ! Places error ({resp.status_code}): {resp.text[:120]}")
            break
        data = resp.json()
        out.extend(data.get("places", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
        time.sleep(2)  # Places requires a short wait before the next page
    return out


def website_works(url: str) -> bool:
    """Open the website link to confirm it's a real, live site (not dead)."""
    if not url:
        return False
    headers = {"User-Agent": USER_AGENT}
    for method in (requests.head, requests.get):
        try:
            resp = method(
                url, headers=headers, timeout=5, allow_redirects=True,
            )
            if resp.status_code < 400:
                return True
        except requests.RequestException:
            continue
    return False


def _probe_domain(domain: str, phone_digits: str) -> str:
    """Try one guessed domain; return URL if the business phone is on the page."""
    for url in (f"https://{domain}", f"http://{domain}"):
        try:
            resp = requests.get(
                url, headers={"User-Agent": USER_AGENT}, timeout=3,
                allow_redirects=True,
            )
        except requests.RequestException:
            continue
        if resp.status_code >= 400:
            continue
        if phone_digits in re.sub(r"\D", "", resp.text):
            return resp.url
        break
    return ""


# Generic words in HVAC names that don't help guess a domain.
_GENERIC = {
    "air", "conditioning", "conditioner", "heating", "cooling", "hvac", "ac",
    "llc", "inc", "co", "company", "corp", "services", "service", "the", "and",
    "of", "fl", "florida", "repair", "repairs", "refrigeration", "mechanical",
    "solutions", "systems", "comfort", "climate", "control", "plumbing",
    "electric", "electrical", "heat",
}


def _domain_guesses(name: str) -> list[str]:
    """Build a short list of likely web addresses from a business name.

    e.g. "Sharkey Air LLC" -> sharkey.com, sharkeyair.com, sharkeyac.com, ...
    """
    words = [w for w in re.findall(r"[a-z0-9]+", name.lower()) if len(w) >= 3]
    distinct = [w for w in words if w not in _GENERIC]

    stems: set[str] = set()
    if distinct:
        stems.add(distinct[0])
        stems.add("".join(distinct))
        if len(distinct) >= 2:
            stems.add("".join(distinct[:2]))
        for suffix in ("air", "ac", "hvac", "heating", "cooling", "comfort"):
            stems.add(distinct[0] + suffix)
    stems.add("".join(words))  # whole name mashed together

    domains: list[str] = []
    for stem in stems:
        if 3 <= len(stem) <= 30:
            domains.append(stem + ".com")
            domains.append(stem + ".net")
    return domains[:8]


def find_unlinked_website(name: str, phone: str) -> str:
    """Find a website Google DOESN'T know about by guessing the address.

    Probes likely domains in parallel; only counts a hit if the business phone
    appears on the page.
    """
    phone_digits = re.sub(r"\D", "", phone)[-10:]
    if not phone_digits:
        return ""

    domains = _domain_guesses(name)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(_probe_domain, d, phone_digits) for d in domains]
        for fut in as_completed(futures):
            hit = fut.result()
            if hit:
                return hit
    return ""


def review_points(reviews: int) -> int:
    """Map review count to 0-20 points.

    0-5   = neutral
    5-50  = bonus (ramps up)
    50-150 = max bonus (20)
    150+  = smaller bonus
    300+  = possible penalty
    """
    if reviews <= 5:
        return 8
    if reviews < 50:
        return 8 + int((reviews - 5) / (50 - 5) * 10)
    if reviews <= 150:
        return 20
    if reviews < 300:
        return 20 - int((reviews - 150) / (300 - 150) * 8)
    penalty = min(7, (reviews - 300) // 40)
    return max(5, 12 - penalty)


def rating_points(rating: float | None) -> int:
    """Map star rating to 0-15 points."""
    if rating is None:
        return 4
    r = float(rating)
    if r >= 4.8:
        return 15
    if r >= 4.6:
        return 13
    if r >= 4.4:
        return 11
    if r >= 4.2:
        return 9
    if r >= 4.0:
        return 7
    if r >= 3.7:
        return 5
    if r >= 3.5:
        return 3
    return 1


def legitimacy_points(lead: dict) -> int:
    """Estimate business legitimacy from name and address (0-15)."""
    name = lead.get("name", "")
    low = name.lower()
    pts = 6
    if re.search(r"\b(llc|inc|corp|incorporated|company)\b", low):
        pts += 4
    if "&" in name or " and " in low:
        pts += 2
    addr = lead.get("address", "")
    if addr and re.search(r"\d+\s+\w+", addr):
        pts += 3
    if _SPAM_NAME.search(name):
        pts -= 5
    words = [w for w in re.findall(r"[a-z]+", low) if len(w) >= 3]
    if words:
        generic = sum(1 for w in words if w in _GENERIC)
        if generic >= len(words) * 0.6 and len(words) <= 4:
            pts -= 3
    return max(0, min(15, pts))


def site_opportunity_points(lead: dict) -> int:
    """50 points when there is no website or the site is dead."""
    if lead.get("site_status") in ("none", "dead"):
        return 50
    return 0


def compute_lead_score(lead: dict) -> tuple[int, str]:
    """Score a lead 0-100 using the fixed rubric."""
    site = site_opportunity_points(lead)
    rev = review_points(int(lead.get("reviews") or 0))
    rat = rating_points(lead.get("rating"))
    leg = legitimacy_points(lead)
    total = min(100, site + rev + rat + leg)

    if lead.get("site_status") == "none":
        site_label = "No website"
    elif lead.get("site_status") == "dead":
        site_label = "Dead website"
    else:
        site_label = "Site opportunity"

    rating_txt = f"{float(lead['rating']):.1f}" if lead.get("rating") else "?"
    reason = (
        f"{site_label} · {lead['reviews']} reviews · {rating_txt}★ · "
        f"legitimacy {leg}/15"
    )
    return total, reason


def score_all_leads(leads: list[dict]) -> None:
    """Apply the rubric to every lead in-place."""
    for lead in leads:
        lead["score"], lead["reason"] = compute_lead_score(lead)


def _verify_no_site(lead: dict) -> dict | None:
    """Return lead if confirmed no website, else None."""
    if find_unlinked_website(lead["name"], lead["phone"]):
        return None
    lead["has_website"] = False
    lead["site_status"] = "none"
    return lead


def _verify_dead_site(lead: dict) -> dict | None:
    """Return lead if website is dead, else None."""
    if website_works(lead["website"]):
        return None
    lead["has_website"] = False
    lead["site_status"] = "dead"
    return lead


def collect_leads(
    cities: list[str],
    max_leads: int = MAX_LEADS,
    pool_size: int = SCAN_POOL,
    min_score: int = MIN_SCORE,
    min_reviews: int = MIN_REVIEWS,
    use_openai: bool = True,
    exclude_phones: set[str] | None = None,
    progress=None,
    opportunities_only: bool = True,
) -> list[dict]:
    """Find HVAC leads and return the best ones as a list of dicts.

    1. Pull up to `pool_size` businesses from Google Places.
    2. Keep only real opportunities (no website or dead website).
    3. Score every opportunity with the rubric (50 + reviews + rating + legitimacy).
    4. Return up to `max_leads` with score >= `min_score` (best first).

    Shared engine for both the command line and the phone app.
    """
    google_key, _openai_key = load_keys()
    exclude_phones = exclude_phones or set()

    def say(msg: str) -> None:
        print(msg)
        if progress is not None:
            progress(msg)

    # --- Phase 1: gather a large pool from Google Places ---
    say(f"Searching Google Places (scanning up to {pool_size} businesses)...")
    no_link: dict[str, dict] = {}   # no website on their Google profile
    with_link: dict[str, dict] = {}  # has a website listed
    seen = set(exclude_phones)
    queries = [f"{term} {city}" for city in cities for term in SEARCH_TERMS]

    for query in queries:
        total = len(no_link) + len(with_link)
        if total >= pool_size:
            break
        say(f"Searching: {query}  ({total}/{pool_size} scanned)")
        for place in search_places(query, google_key, max_pages=3):
            total = len(no_link) + len(with_link)
            if total >= pool_size:
                break
            if place.get("businessStatus") not in (None, "OPERATIONAL"):
                continue
            phone = (place.get("nationalPhoneNumber") or "").strip()
            if not phone or phone in seen:
                continue
            if int(place.get("userRatingCount") or 0) < min_reviews:
                continue
            seen.add(phone)
            record = {
                "name": (place.get("displayName") or {}).get("text", "").strip(),
                "phone": phone,
                "website": (place.get("websiteUri") or "").strip(),
                "rating": place.get("rating"),
                "reviews": int(place.get("userRatingCount") or 0),
                "address": (place.get("formattedAddress") or "").strip(),
            }
            (with_link if record["website"] else no_link)[phone] = record
        time.sleep(0.5)

    # --- Phase 2: verify no-website businesses (parallel) ---
    opportunities: list[dict] = []
    candidates = list(no_link.values())
    say(f"Checking {len(candidates)} businesses for hidden websites...")
    done = 0
    with ThreadPoolExecutor(max_workers=CHECK_WORKERS) as pool:
        futures = {pool.submit(_verify_no_site, lead): lead for lead in candidates}
        for fut in as_completed(futures):
            done += 1
            if done % 5 == 0 or done == len(candidates):
                say(f"Checked {done}/{len(candidates)} no-website businesses")
            hit = fut.result()
            if hit:
                opportunities.append(hit)

    # --- Phase 3: check listed sites for dead/broken ones (parallel) ---
    listed = list(with_link.values())
    say(f"Checking {len(listed)} listed websites...")
    done = 0
    with ThreadPoolExecutor(max_workers=CHECK_WORKERS) as pool:
        futures = {pool.submit(_verify_dead_site, lead): lead for lead in listed}
        for fut in as_completed(futures):
            done += 1
            if done % 10 == 0 or done == len(listed):
                say(f"Checked {done}/{len(listed)} listed sites")
            hit = fut.result()
            if hit:
                opportunities.append(hit)

    rows = opportunities
    if not opportunities_only:
        kept_phones = {r["phone"] for r in rows}
        for lead in with_link.values():
            if lead["phone"] not in kept_phones:
                lead["has_website"] = website_works(lead["website"])
                lead["site_status"] = "working" if lead["has_website"] else "dead"
                rows.append(lead)

    if not rows:
        return []

    say(f"Scoring {len(rows)} opportunities...")
    score_all_leads(rows)

    rows.sort(key=lambda x: -x["score"])
    high = [r for r in rows if r["score"] >= min_score]
    picked = high[:max_leads]
    if picked:
        say(f"Kept {len(picked)} leads scoring {min_score}+ (from {len(rows)} opportunities)")
    else:
        say(f"No leads scored {min_score}+ — try more cities or lower MIN_SCORE")
    return picked


def main() -> None:
    rows = collect_leads(CITIES, max_leads=MAX_LEADS, use_openai=USE_OPENAI)

    print(f"\nStep 4 — saving {len(rows)} leads to {OUTPUT_CSV.name}")
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "Score", "Business", "Phone", "Website Status", "Website",
            "Rating", "Reviews", "Reason", "Address",
        ])
        status_label = {"working": "Has site", "dead": "Dead site", "none": "No site"}
        for lead in rows:
            writer.writerow([
                lead["score"],
                lead["name"],
                lead["phone"],
                status_label.get(lead["site_status"], lead["site_status"]),
                lead["website"] or "NONE",
                lead["rating"],
                lead["reviews"],
                lead["reason"],
                lead["address"],
            ])

    print("\nDone! Open leads.csv to see your leads (best first).")


if __name__ == "__main__":
    main()

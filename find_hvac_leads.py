#!/usr/bin/env python3
"""
Find HVAC businesses with NO website across Florida.

Prioritizes the best outbound candidates: operational businesses with a phone,
no website, and a real Google presence (reviews/rating) so you can pull their
info from what's already online.

Uses Google Places API (New). Appends only NEW leads to master files.
Saves progress after each search so you can resume when the daily quota runs out.

Outputs:
  hvac_leads_master.txt   — all qualified leads (name | phone)
  hvac_leads_best.txt     — top candidates ranked by score
  hvac_leads_data.json    — full lead data with ratings and scores
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from florida_cities import FLORIDA_CITIES

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEARCH_TERMS = [
    "HVAC contractor",
    "air conditioning repair",
    "heating and cooling",
    "AC repair",
    "furnace repair",
]

MASTER_FILE = Path(__file__).parent / "hvac_leads_master.txt"
BEST_FILE = Path(__file__).parent / "hvac_leads_best.txt"
DATA_FILE = Path(__file__).parent / "hvac_leads_data.json"
LEGACY_FILE = Path(__file__).parent / "hvac_no_website_port_st_lucie.txt"
PROGRESS_FILE = Path(__file__).parent / ".search_progress.json"

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.nationalPhoneNumber,"
    "places.websiteUri,places.businessStatus,places.rating,"
    "places.userRatingCount,places.formattedAddress,places.types,"
    "places.googleMapsUri,nextPageToken"
)
REQUEST_DELAY_SEC = 2.0

# Default quality bar for "best" candidates
DEFAULT_MIN_REVIEWS = 5
DEFAULT_MIN_RATING = 3.5

LINE_PATTERN = re.compile(r"^(.+?)\s*\|\s*(.+)$")

HVAC_TYPES = frozenset({
    "hvac_contractor",
    "general_contractor",
    "electrician",
    "plumber",
    "home_goods_store",
    "store",
    "point_of_interest",
    "establishment",
})

LOW_PRIORITY_NAME_KEYWORDS = (
    "auto ",
    "automotive",
    "car ",
    "plumbing",
    "plumber",
    "dryer vent",
    "duct clean",
    "dry vent",
    "electric only",
    "roofing",
    "pest control",
    "landscap",
    "pool service",
    "garage door",
)


class QuotaExceededError(RuntimeError):
    pass


@dataclass
class Lead:
    name: str
    phone: str
    place_id: str = ""
    rating: float | None = None
    review_count: int = 0
    address: str = ""
    city: str = ""
    types: list[str] = field(default_factory=list)
    maps_uri: str = ""
    score: int = 0
    added_at: str = ""

    def phone_key(self) -> str:
        return phone_key(self.phone)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def has_website(website: str | None) -> bool:
    return bool(website and website.strip())


def city_from_query(query: str) -> str:
    """Extract city from e.g. 'HVAC contractor Port St. Lucie, FL'."""
    for city in FLORIDA_CITIES:
        if city.lower() in query.lower():
            return city
    return ""


def get_api_key() -> str:
    load_dotenv(Path(__file__).parent / ".env")
    key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not key:
        print(
            "Error: Set GOOGLE_MAPS_API_KEY in lead-finder/.env\n"
            "Enable 'Places API (New)' at https://console.cloud.google.com/",
            file=sys.stderr,
        )
        sys.exit(1)
    return key


def build_queries() -> list[str]:
    return [f"{term} {city}" for city in FLORIDA_CITIES for term in SEARCH_TERMS]


def load_progress() -> set[str]:
    if not PROGRESS_FILE.exists():
        return set()
    data = json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
    return set(data.get("completed_queries", []))


def save_progress(completed: set[str]) -> None:
    payload = {
        "completed_queries": sorted(completed),
        "total_completed": len(completed),
    }
    PROGRESS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_master_txt(path: Path) -> list[tuple[str, str]]:
    if not path.exists():
        return []

    leads: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = LINE_PATTERN.match(line)
        if match:
            leads.append((match.group(1).strip(), match.group(2).strip()))
    return leads


def load_leads_data() -> dict[str, Lead]:
    if not DATA_FILE.exists():
        return {}

    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    leads: dict[str, Lead] = {}
    for item in raw.get("leads", []):
        lead = Lead(
            name=item.get("name", ""),
            phone=item.get("phone", ""),
            place_id=item.get("place_id", ""),
            rating=item.get("rating"),
            review_count=int(item.get("review_count", 0)),
            address=item.get("address", ""),
            city=item.get("city", ""),
            types=list(item.get("types", [])),
            maps_uri=item.get("maps_uri", ""),
            score=int(item.get("score", 0)),
            added_at=item.get("added_at", ""),
        )
        key = lead.phone_key()
        if key:
            leads[key] = lead
    return leads


def save_leads_data(leads: dict[str, Lead]) -> None:
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "leads": [
            {
                "name": lead.name,
                "phone": lead.phone,
                "place_id": lead.place_id,
                "rating": lead.rating,
                "review_count": lead.review_count,
                "address": lead.address,
                "city": lead.city,
                "types": lead.types,
                "maps_uri": lead.maps_uri,
                "score": lead.score,
                "added_at": lead.added_at,
            }
            for lead in sorted(leads.values(), key=lambda x: (-x.score, x.name.lower()))
        ],
    }
    DATA_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_master_txt(leads: dict[str, Lead]) -> None:
    sorted_leads = sorted(leads.values(), key=lambda x: x.name.lower())
    lines = [f"{lead.name} | {lead.phone}" for lead in sorted_leads]
    MASTER_FILE.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def is_best_candidate(lead: Lead, min_reviews: int, min_rating: float) -> bool:
    if lead.review_count < min_reviews:
        return False
    if lead.rating is not None and lead.rating < min_rating:
        return False
    if lead.score < 20:
        return False
    return True


def write_best_txt(leads: dict[str, Lead], min_reviews: int, min_rating: float) -> int:
    best = [
        lead for lead in leads.values()
        if is_best_candidate(lead, min_reviews, min_rating)
    ]
    best.sort(key=lambda x: (-x.score, -x.review_count, x.name.lower()))

    lines = [
        "# Best HVAC leads — no website, strong Google presence, ranked by score",
        f"# Min reviews: {min_reviews} | Min rating: {min_rating}",
        "",
    ]
    for lead in best:
        rating_str = f"{lead.rating:.1f}" if lead.rating is not None else "n/a"
        lines.append(
            f"{lead.score:3d} | {rating_str} ({lead.review_count} reviews) | "
            f"{lead.name} | {lead.phone} | {lead.city or lead.address}"
        )

    BEST_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(best)


def import_legacy_if_needed(leads: dict[str, Lead]) -> None:
    if leads:
        return

    for path in (MASTER_FILE, LEGACY_FILE):
        if not path.exists():
            continue
        legacy = load_master_txt(path)
        if not legacy:
            continue
        print(f"Importing {len(legacy)} leads from {path.name}\n")
        for name, phone in legacy:
            key = phone_key(phone)
            if key and key not in leads:
                leads[key] = Lead(name=name, phone=phone, added_at="imported")
        save_leads_data(leads)
        write_master_txt(leads)
        break


def compute_score(name: str, rating: float | None, review_count: int, types: list[str]) -> int:
    """Higher score = better outbound candidate for Acsend Sites."""
    score = 0

    # Google presence: reviews mean photos/info exist online to scrape
    capped_reviews = min(review_count, 80)
    score += capped_reviews * 3

    if rating is not None:
        score += int(round(rating * 8))

    # Sweet spot: established local business, not a massive chain
    if 5 <= review_count <= 75:
        score += 12
    elif review_count > 150:
        score -= 8

    type_set = set(types)
    if type_set & HVAC_TYPES:
        score += 10

    lower = name.lower()
    if any(keyword in lower for keyword in LOW_PRIORITY_NAME_KEYWORDS):
        score -= 25

    # Strong HVAC signals in the name
    if any(word in lower for word in ("hvac", "air condition", "heating", "cooling", " a/c", " ac ")):
        score += 8

    return max(score, 0)


def places_text_search(
    query: str,
    api_key: str,
    page_token: str | None = None,
    min_rating: float | None = None,
) -> dict:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body: dict = {"textQuery": query, "maxResultCount": 20}
    if page_token:
        body["pageToken"] = page_token
    if min_rating is not None:
        body["minRating"] = min_rating

    resp = requests.post(TEXT_SEARCH_URL, headers=headers, json=body, timeout=30)
    if resp.status_code == 429:
        raise QuotaExceededError(
            "Google Places daily quota hit. Run again tomorrow — progress is saved."
        )
    if not resp.ok:
        detail = resp.text[:300]
        raise RuntimeError(f"Text Search failed ({resp.status_code}): {detail}")

    return resp.json()


def parse_place(place: dict, query: str) -> Lead | None:
    place_id = place.get("id", "")
    name = (place.get("displayName") or {}).get("text", "").strip()
    phone_raw = (place.get("nationalPhoneNumber") or "").strip()
    website = place.get("websiteUri")
    status = place.get("businessStatus", "OPERATIONAL")

    if not name:
        return None
    if status and status != "OPERATIONAL":
        return None
    if has_website(website):
        return None
    if not phone_raw:
        return None

    phone = normalize_phone(phone_raw)
    rating = place.get("rating")
    review_count = int(place.get("userRatingCount") or 0)
    types = list(place.get("types") or [])
    address = (place.get("formattedAddress") or "").strip()
    maps_uri = (place.get("googleMapsUri") or "").strip()
    city = city_from_query(query)

    score = compute_score(name, rating, review_count, types)

    return Lead(
        name=name,
        phone=phone,
        place_id=place_id,
        rating=float(rating) if rating is not None else None,
        review_count=review_count,
        address=address,
        city=city,
        types=types,
        maps_uri=maps_uri,
        score=score,
        added_at=datetime.now(timezone.utc).isoformat(),
    )


def enrich_leads(api_key: str, leads: dict[str, Lead]) -> int:
    """Fetch Google ratings for leads missing review data (uses API quota)."""
    updated = 0
    pending = [lead for lead in leads.values() if lead.review_count == 0]
    print(f"Enriching {len(pending)} leads from Google...\n")

    for i, lead in enumerate(pending, 1):
        print(f"[{i}/{len(pending)}] {lead.name}")
        time.sleep(REQUEST_DELAY_SEC)

        try:
            data = places_text_search(f"{lead.name} FL", api_key)
        except QuotaExceededError as exc:
            print(f"\nStopped enrichment: {exc}")
            break

        matched = False
        for place in data.get("places", []):
            phone_raw = (place.get("nationalPhoneNumber") or "").strip()
            if not phone_raw:
                continue
            if phone_key(normalize_phone(phone_raw)) != lead.phone_key():
                continue

            lead.place_id = place.get("id", lead.place_id)
            lead.rating = float(place["rating"]) if place.get("rating") is not None else None
            lead.review_count = int(place.get("userRatingCount") or 0)
            lead.address = (place.get("formattedAddress") or lead.address).strip()
            lead.types = list(place.get("types") or lead.types)
            lead.maps_uri = (place.get("googleMapsUri") or lead.maps_uri).strip()
            if not lead.city:
                lead.city = city_from_address(lead.address)
            lead.score = compute_score(lead.name, lead.rating, lead.review_count, lead.types)
            matched = True
            updated += 1
            rating_str = f"{lead.rating:.1f}" if lead.rating is not None else "n/a"
            print(f"  → {rating_str} ({lead.review_count} reviews) score={lead.score}")
            break

        if not matched:
            print("  → no match")

    return updated


def city_from_address(address: str) -> str:
    for city in FLORIDA_CITIES:
        city_name = city.split(",")[0].strip()
        if city_name.lower() in address.lower():
            return city
    return ""


def collect_new_leads(
    api_key: str,
    leads: dict[str, Lead],
    completed_queries: set[str],
    min_reviews: int,
    min_rating: float,
    best_only: bool,
) -> tuple[list[Lead], dict[str, int], bool]:
    seen_ids: set[str] = set()
    new_leads: list[Lead] = []
    skipped = {
        "has_website": 0,
        "no_phone": 0,
        "closed": 0,
        "duplicate_run": 0,
        "already_in_master": 0,
        "low_quality": 0,
        "queries_skipped": 0,
    }
    quota_hit = False

    all_queries = build_queries()
    pending = [q for q in all_queries if q not in completed_queries]
    skipped["queries_skipped"] = len(all_queries) - len(pending)

    print(f"Total searches: {len(all_queries)} | Already done: {len(completed_queries)}")
    print(f"Remaining today: {len(pending)}")
    print(
        f"Quality filter: min {min_reviews} reviews, "
        f"min {min_rating} rating | best_only={best_only}\n"
    )

    for i, query in enumerate(pending, 1):
        print(f"[{i}/{len(pending)}] Searching: {query}")
        page_token: str | None = None
        query_finished = False

        while True:
            if page_token:
                time.sleep(REQUEST_DELAY_SEC)

            try:
                data = places_text_search(
                    query, api_key, page_token, min_rating=min_rating if best_only else None
                )
            except QuotaExceededError as exc:
                print(f"\nStopped early: {exc}")
                quota_hit = True
                break

            for place in data.get("places", []):
                place_id = place.get("id", "")
                if place_id and place_id in seen_ids:
                    skipped["duplicate_run"] += 1
                    continue
                if place_id:
                    seen_ids.add(place_id)

                if place.get("businessStatus") and place.get("businessStatus") != "OPERATIONAL":
                    skipped["closed"] += 1
                    continue
                if has_website(place.get("websiteUri")):
                    skipped["has_website"] += 1
                    continue
                if not (place.get("nationalPhoneNumber") or "").strip():
                    skipped["no_phone"] += 1
                    continue

                lead = parse_place(place, query)
                if not lead:
                    continue

                key = lead.phone_key()
                if key in leads:
                    skipped["already_in_master"] += 1
                    continue

                if best_only and not is_best_candidate(lead, min_reviews, min_rating):
                    skipped["low_quality"] += 1
                    continue

                if not best_only and lead.review_count < min_reviews:
                    skipped["low_quality"] += 1
                    continue

                leads[key] = lead
                new_leads.append(lead)
                save_leads_data(leads)
                write_master_txt(leads)
                write_best_txt(leads, min_reviews, min_rating)

                rating_str = f"{lead.rating:.1f}" if lead.rating is not None else "n/a"
                print(
                    f"  + NEW [{lead.score}] {lead.name} | {lead.phone} "
                    f"| {rating_str} ({lead.review_count} reviews)"
                )

            page_token = data.get("nextPageToken")
            if not page_token:
                query_finished = True
                break

        if quota_hit:
            break

        if query_finished:
            completed_queries.add(query)
            save_progress(completed_queries)

    return new_leads, skipped, quota_hit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Find best no-website HVAC leads in Florida"
    )
    parser.add_argument(
        "--reset-progress",
        action="store_true",
        help="Clear search progress and re-scan all cities (keeps existing leads)",
    )
    parser.add_argument(
        "--min-reviews",
        type=int,
        default=DEFAULT_MIN_REVIEWS,
        help=f"Minimum Google reviews (default: {DEFAULT_MIN_REVIEWS})",
    )
    parser.add_argument(
        "--min-rating",
        type=float,
        default=DEFAULT_MIN_RATING,
        help=f"Minimum Google rating (default: {DEFAULT_MIN_RATING})",
    )
    parser.add_argument(
        "--best-only",
        action="store_true",
        help="Only save leads that pass the full best-candidate filter",
    )
    parser.add_argument(
        "--enrich",
        action="store_true",
        help="Fetch Google ratings for existing leads missing review data (uses API quota)",
    )
    parser.add_argument(
        "--rerank",
        action="store_true",
        help="Re-score existing leads and refresh best file without searching",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("HVAC Lead Finder — Best candidates, Florida")
    print(f"Cities: {len(FLORIDA_CITIES)} | Filter: NO website + Google presence")
    print(f"Master: {MASTER_FILE.name} | Best: {BEST_FILE.name}\n")

    if args.reset_progress and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        print("Search progress reset. Existing leads kept.\n")

    leads = load_leads_data()
    import_legacy_if_needed(leads)

    if args.rerank or args.enrich:
        if args.enrich:
            api_key = get_api_key()
            enriched = enrich_leads(api_key, leads)
            print(f"\nEnriched {enriched} leads.")
        for lead in leads.values():
            lead.score = compute_score(lead.name, lead.rating, lead.review_count, lead.types)
        save_leads_data(leads)
        write_master_txt(leads)
        best_count = write_best_txt(leads, args.min_reviews, args.min_rating)
        print(f"Re-ranked {len(leads)} leads. Best file: {best_count} candidates.")
        return

    api_key = get_api_key()
    completed = load_progress()

    print(f"Already in master: {len(leads)} leads\n")

    new_leads, skipped, quota_hit = collect_new_leads(
        api_key,
        leads,
        completed,
        min_reviews=args.min_reviews,
        min_rating=args.min_rating,
        best_only=args.best_only,
    )

    best_count = write_best_txt(leads, args.min_reviews, args.min_rating)

    print(
        f"\nSkipped — has website: {skipped['has_website']}, "
        f"no phone: {skipped['no_phone']}, "
        f"closed: {skipped['closed']}, "
        f"low quality: {skipped['low_quality']}, "
        f"already in master: {skipped['already_in_master']}, "
        f"queries already done: {skipped['queries_skipped']}"
    )
    print(f"\nNew leads added this run: {len(new_leads)}")
    print(f"Total in master: {len(leads)}")
    print(f"Best candidates: {best_count} → {BEST_FILE.name}")
    print(f"Full data: {DATA_FILE.name}")
    print(f"Progress: {len(load_progress())} / {len(build_queries())} searches complete")

    if quota_hit:
        print("\nTip: Run the same command tomorrow to continue where you left off.")


if __name__ == "__main__":
    main()

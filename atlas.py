"""Atlas V1 — learning scorer (planned).

Atlas will read Nexus call-tracking data and use OpenAI to adjust lead scores
based on what actually converts: cities, lead types, score bands, outcomes.

V1 pipeline (not live yet):
  1. Pull aggregated stats from tracking DB (calls, interest, closes by city/type)
  2. Send lead + stats context to OpenAI
  3. Return a score adjustment (-20 to +20) merged into the rubric

Until ATLAS_ENABLED is True, all adjustments are zero.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import tracking

HERE = Path(__file__).parent
ATLAS_ENABLED = os.getenv("ATLAS_ENABLED", "").lower() in ("1", "true", "yes")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def build_learning_context() -> dict:
    """Summarize call history into signals Atlas can learn from."""
    stats = tracking.statistics_page()
    dash = tracking.dashboard_stats()
    return {
        "total_calls": stats.get("total_calls", 0),
        "dead_close_rate": stats.get("dead_conversion", 0),
        "no_close_rate": stats.get("no_conversion", 0),
        "dead_interest_rate": stats.get("dead_interest", 0),
        "no_interest_rate": stats.get("no_interest", 0),
        "avg_score_interested": stats.get("avg_score_interested", 0),
        "avg_score_client": stats.get("avg_score_client", 0),
        "top_cities_interest": stats.get("top_cities_interest", [])[:5],
        "top_cities_close": stats.get("top_cities_close", [])[:5],
        "recent_outcomes": [
            {
                "city": r.get("city"),
                "site_status": r.get("site_status"),
                "outcome": r.get("outcome"),
                "score": r.get("score"),
            }
            for r in (dash.get("recent") or [])[:20]
        ],
    }


def atlas_score_adjustment(lead: dict) -> tuple[int, str]:
    """Return (delta, reason). Stub returns (0, '') until V1 is enabled."""
    if not ATLAS_ENABLED:
        return 0, ""

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return 0, ""

    context = build_learning_context()
    if context["total_calls"] < 10:
        return 0, ""  # need enough data before learning

    city = tracking.city_from_address(lead.get("address", ""))
    payload = {
        "lead": {
            "name": lead.get("name"),
            "score": lead.get("score"),
            "site_status": lead.get("site_status"),
            "city": city,
            "reviews": lead.get("reviews"),
            "rating": lead.get("rating"),
        },
        "learning": context,
    }
    system = (
        "You are Atlas V1, a lead-scoring adjuster for an HVAC website sales team. "
        "Given historical call outcomes and a new lead, return a score adjustment "
        "from -20 to +20. Positive = more likely to convert based on patterns. "
        "Reply JSON: {\"delta\": <int>, \"reason\": \"<short sentence>\"}."
    )
    try:
        import requests

        resp = requests.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(payload)},
                ],
            },
            timeout=60,
        )
        if not resp.ok:
            return 0, ""
        data = json.loads(resp.json()["choices"][0]["message"]["content"])
        delta = max(-20, min(20, int(data.get("delta", 0))))
        reason = str(data.get("reason", "")).strip()
        return delta, f"Atlas: {reason}" if reason else ""
    except (ImportError, KeyError, ValueError, TypeError):
        return 0, ""


def apply_atlas(lead: dict) -> None:
    """Apply Atlas adjustment to lead score in-place."""
    base = int(lead.get("score") or 0)
    delta, note = atlas_score_adjustment(lead)
    if delta:
        lead["score"] = max(0, min(100, base + delta))
        lead["atlas_delta"] = delta
        if note:
            lead["reason"] = f"{lead.get('reason', '')} · {note}".strip(" ·")

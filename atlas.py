"""Atlas V1 — thin wrapper around Nexus learning (kept for imports)."""

from __future__ import annotations

from learning import apply_learning


def apply_atlas(lead: dict) -> None:
    """Legacy per-lead hook — batch learning runs in score_all_leads instead."""
    del lead  # no-op; use apply_learning on the full batch

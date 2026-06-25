"""Shared data paths — point NEXUS_DATA_DIR at a Render persistent disk."""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).parent
DATA_ROOT = Path(os.getenv("NEXUS_DATA_DIR", str(HERE / "data")))
DATA_ROOT.mkdir(parents=True, exist_ok=True)

HISTORY_FILE = DATA_ROOT / "generated_history.json"
JOBS_DIR = DATA_ROOT / "jobs"
LEARN_CACHE_FILE = DATA_ROOT / "learn_cache.json"

JOBS_DIR.mkdir(parents=True, exist_ok=True)

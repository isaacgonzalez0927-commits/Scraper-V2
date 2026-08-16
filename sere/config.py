"""Sere runtime configuration."""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA_ROOT = Path(os.getenv("SERE_DATA_DIR", str(ROOT / "data")))
DATA_ROOT.mkdir(parents=True, exist_ok=True)


class Config:
    SECRET_KEY = os.getenv("SERE_SECRET_KEY") or os.getenv("SECRET_KEY") or "sere-dev-only"
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "SERE_DATABASE_URL", f"sqlite:///{DATA_ROOT / 'sere.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    MAX_CONTENT_LENGTH = 12 * 1024 * 1024
    UPLOAD_FOLDER = Path(os.getenv("SERE_UPLOAD_DIR", str(DATA_ROOT / "uploads")))
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_NAME = "sere_session"
    REMEMBER_COOKIE_HTTPONLY = True
    WTF_CSRF_TIME_LIMIT = None

    SMTP_HOST = os.getenv("SERE_SMTP_HOST", "").strip()
    SMTP_PORT = int(os.getenv("SERE_SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SERE_SMTP_USER", "").strip()
    SMTP_PASSWORD = os.getenv("SERE_SMTP_PASSWORD", "").strip()
    SMTP_FROM = os.getenv("SERE_SMTP_FROM", "Sere <noreply@sere.cash>").strip()
    SMTP_USE_TLS = os.getenv("SERE_SMTP_TLS", "1") != "0"
    PUBLIC_BASE_URL = os.getenv("SERE_PUBLIC_BASE_URL", "").rstrip("/")

    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
    STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

    AUTO_SEED = os.getenv("SERE_AUTO_SEED", "1") != "0"

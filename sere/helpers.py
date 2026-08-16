"""Request parsing and small view helpers."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from flask import request

from sere.money import dollars_to_cents, parse_decimal


def field(name: str, default: str = "") -> str:
    return (request.form.get(name) or default).strip()


def date_field(name: str, default: date | None = None) -> date | None:
    raw = field(name)
    if not raw:
        return default
    return date.fromisoformat(raw)


def datetime_field(name: str) -> datetime | None:
    raw = field(name)
    if not raw:
        return None
    if len(raw) == 16:
        raw = raw + ":00"
    return datetime.fromisoformat(raw)


def cents_field(name: str) -> int:
    raw = field(name)
    if not raw:
        return 0
    return dollars_to_cents(raw)


def qty_field(name: str, default: str = "1") -> Decimal:
    return parse_decimal(field(name, default) or default, Decimal("0.001"))


def int_field(name: str, default: int = 0) -> int:
    raw = field(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def copy_service_address(target, source) -> None:
    target.service_line1 = source.service_line1
    target.service_line2 = source.service_line2
    target.service_city = source.service_city
    target.service_state = source.service_state
    target.service_postal = source.service_postal


STATUS_LABELS = {
    "unscheduled": "Unscheduled",
    "scheduled": "Scheduled",
    "in_progress": "In progress",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "draft": "Draft",
    "sent": "Sent",
    "viewed": "Viewed",
    "partial": "Partially paid",
    "paid": "Paid",
    "overdue": "Overdue",
    "void": "Void",
    "card": "Card",
    "ach": "ACH / bank",
    "cash": "Cash",
    "check": "Check",
    "other": "Other",
    "materials": "Materials",
    "equipment": "Equipment",
    "subcontractors": "Subcontractors",
    "labor": "Labor",
    "miscellaneous": "Miscellaneous",
}

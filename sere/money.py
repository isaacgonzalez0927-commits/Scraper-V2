"""Integer-cent money helpers. Never use binary floats for currency."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

CENTS = Decimal("0.01")
QTY = Decimal("0.001")


def parse_decimal(value: Any, places: Decimal = CENTS) -> Decimal:
    """Parse user input into a Decimal quantized to ``places``."""
    if value is None or value == "":
        return Decimal("0").quantize(places)
    if isinstance(value, Decimal):
        return value.quantize(places, rounding=ROUND_HALF_UP)
    text = str(value).strip().replace(",", "").replace("$", "")
    if text in {"", "-", ".", "-."}:
        return Decimal("0").quantize(places)
    try:
        return Decimal(text).quantize(places, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid amount: {value!r}") from exc


def dollars_to_cents(value: Any) -> int:
    """Convert a dollar amount (string, int, Decimal) to integer cents."""
    amount = parse_decimal(value, CENTS)
    return int(amount * 100)


def cents_to_decimal(cents: int | None) -> Decimal:
    return (Decimal(cents or 0) / 100).quantize(CENTS)


def format_money(cents: int | None, *, signed: bool = False) -> str:
    """Format cents as $1,234.56. Negative values get a leading minus."""
    value = int(cents or 0)
    sign = "-" if value < 0 else ("+" if signed and value > 0 else "")
    value = abs(value)
    return f"{sign}${value // 100:,}.{value % 100:02d}"


def format_percent(bps: int | None) -> str:
    """Format basis points (700 = 7.00%) as a display string."""
    value = Decimal(bps or 0) / 100
    return f"{value.quantize(CENTS)}%"


def line_amount_cents(quantity: Any, unit_price_cents: int) -> int:
    qty = parse_decimal(quantity, QTY)
    raw = (qty * Decimal(int(unit_price_cents))).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    return int(raw)


def tax_cents(taxable_cents: int, tax_bps: int) -> int:
    """tax_bps is basis points: 750 = 7.50%."""
    if taxable_cents <= 0 or tax_bps <= 0:
        return 0
    raw = (Decimal(taxable_cents) * Decimal(tax_bps) / Decimal(10000)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    return int(raw)


def margin_bps(revenue_cents: int, cost_cents: int) -> int | None:
    if revenue_cents <= 0:
        return None
    profit = revenue_cents - cost_cents
    raw = (Decimal(profit) * Decimal(10000) / Decimal(revenue_cents)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    return int(raw)


def format_margin(bps: int | None) -> str:
    if bps is None:
        return "—"
    return format_percent(bps)

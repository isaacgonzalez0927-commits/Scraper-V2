"""Invoice totals, status, and lifecycle. Amounts are integer cents."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sere.extensions import db
from sere.models import (
    Activity,
    Invoice,
    InvoiceEvent,
    InvoiceLine,
    Job,
    Notification,
    Organization,
    Payment,
    utcnow,
)
from sere.money import line_amount_cents, tax_cents


OPEN_STATUSES = ("sent", "viewed", "partial", "overdue")
COLLECTIBLE_STATUSES = ("sent", "viewed", "partial", "paid", "overdue")


def valid_payments(invoice: Invoice) -> list[Payment]:
    return [p for p in invoice.payments if p.voided_at is None]


def amount_paid_cents(invoice: Invoice) -> int:
    return sum(p.amount_cents for p in valid_payments(invoice))


def balance_cents(invoice: Invoice) -> int:
    if invoice.status == "void":
        return 0
    return max(0, invoice.total_cents - amount_paid_cents(invoice))


def recalc_totals(invoice: Invoice) -> Invoice:
    subtotal = 0
    for index, line in enumerate(invoice.lines):
        line.position = index
        line.amount_cents = line_amount_cents(line.quantity, line.unit_price_cents)
        subtotal += line.amount_cents
    invoice.subtotal_cents = subtotal
    discount = max(0, min(invoice.discount_cents, subtotal))
    invoice.discount_cents = discount
    invoice.tax_cents = tax_cents(subtotal - discount, invoice.tax_bps)
    invoice.total_cents = subtotal - discount + invoice.tax_cents
    return invoice


def derive_status(invoice: Invoice, today: date | None = None) -> str:
    if invoice.status == "void" or invoice.voided_at:
        return "void"
    paid = amount_paid_cents(invoice)
    total = invoice.total_cents
    remaining = max(0, total - paid)
    if total > 0 and remaining == 0:
        return "paid"
    if invoice.status == "draft" and paid == 0:
        return "draft"
    if remaining > 0 and paid > 0:
        due = invoice.due_date
        if due and due < (today or date.today()):
            return "overdue"
        return "partial"
    due = invoice.due_date
    if remaining > 0 and due and due < (today or date.today()):
        return "overdue"
    if invoice.viewed_at:
        return "viewed"
    if invoice.sent_at:
        return "sent"
    if invoice.status in ("sent", "viewed", "partial", "overdue"):
        return invoice.status
    return "draft"


def refresh_invoice(invoice: Invoice, today: date | None = None) -> Invoice:
    recalc_totals(invoice)
    previous = invoice.status
    invoice.status = derive_status(invoice, today=today)
    if previous != "overdue" and invoice.status == "overdue":
        add_event(invoice, "overdue", f"{invoice.number} became overdue")
        notify(
            invoice.organization_id,
            "invoice_overdue",
            f"{invoice.number} is overdue",
            f"{invoice.customer.display_name} still owes "
            f"{_money(balance_cents(invoice))}.",
            f"/invoices/{invoice.id}",
        )
        log_activity(
            invoice.organization_id,
            "invoice_overdue",
            f"{invoice.number} became overdue",
            balance_cents(invoice),
            f"/invoices/{invoice.id}",
        )
    return invoice


def refresh_open_invoices(organization_id: int, today: date | None = None) -> None:
    invoices = (
        Invoice.query.filter(
            Invoice.organization_id == organization_id,
            Invoice.status.in_(("sent", "viewed", "partial", "overdue", "draft")),
        ).all()
    )
    for invoice in invoices:
        refresh_invoice(invoice, today=today)


def allocate_number(org: Organization) -> str:
    number = f"{org.invoice_prefix}{org.next_invoice_number}"
    org.next_invoice_number += 1
    return number


def add_event(
    invoice: Invoice,
    kind: str,
    message: str,
    amount_cents: int | None = None,
    when: datetime | None = None,
) -> InvoiceEvent:
    event = InvoiceEvent(
        organization_id=invoice.organization_id,
        invoice_id=invoice.id,
        kind=kind,
        message=message,
        amount_cents=amount_cents,
        created_at=when or utcnow(),
    )
    db.session.add(event)
    return event


def notify(
    organization_id: int,
    kind: str,
    title: str,
    body: str = "",
    link: str = "",
) -> Notification:
    item = Notification(
        organization_id=organization_id,
        kind=kind,
        title=title,
        body=body,
        link=link,
    )
    db.session.add(item)
    return item


def log_activity(
    organization_id: int,
    kind: str,
    title: str,
    amount_cents: int | None = None,
    link: str = "",
    when: datetime | None = None,
) -> Activity:
    item = Activity(
        organization_id=organization_id,
        kind=kind,
        title=title,
        amount_cents=amount_cents,
        link=link,
        created_at=when or utcnow(),
    )
    db.session.add(item)
    return item


def apply_payment_to_invoice(invoice: Invoice, payment: Payment) -> None:
    refresh_invoice(invoice)
    add_event(
        invoice,
        "payment",
        f"{_money(payment.amount_cents)} payment received",
        payment.amount_cents,
    )
    remaining = balance_cents(invoice)
    if remaining == 0:
        add_event(invoice, "paid", f"{invoice.number} paid in full")
    if invoice.job_id and invoice.status == "paid":
        job = db.session.get(Job, invoice.job_id)
        if job and job.organization_id == invoice.organization_id:
            job.actual_revenue_cents = invoice.total_cents


def mark_sent(invoice: Invoice) -> None:
    if invoice.status == "void":
        raise ValueError("Cannot send a void invoice.")
    refresh_invoice(invoice)
    if invoice.status == "draft":
        invoice.status = "sent"
    invoice.sent_at = invoice.sent_at or utcnow()
    add_event(invoice, "sent", f"Sent to {invoice.customer.email or 'customer'}")
    log_activity(
        invoice.organization_id,
        "invoice_sent",
        f"{invoice.number} sent to {invoice.customer.display_name}",
        invoice.total_cents,
        f"/invoices/{invoice.id}",
    )


def mark_viewed(invoice: Invoice) -> None:
    if invoice.status in ("void", "draft", "paid"):
        return
    first_view = invoice.viewed_at is None
    invoice.viewed_at = invoice.viewed_at or utcnow()
    refresh_invoice(invoice)
    if first_view:
        add_event(invoice, "viewed", "Customer viewed invoice")
        if balance_cents(invoice) > 0:
            notify(
                invoice.organization_id,
                "invoice_viewed",
                f"{invoice.number} was viewed",
                f"{invoice.customer.display_name} opened the invoice and has not paid.",
                f"/invoices/{invoice.id}",
            )


def void_invoice(invoice: Invoice) -> None:
    if amount_paid_cents(invoice) > 0:
        raise ValueError("Void the payments first, or leave the invoice open.")
    invoice.status = "void"
    invoice.voided_at = utcnow()
    add_event(invoice, "voided", f"{invoice.number} was voided")


def set_lines(
    invoice: Invoice,
    rows: list[dict],
) -> None:
    invoice.lines.clear()
    db.session.flush()
    for index, row in enumerate(rows):
        description = (row.get("description") or "").strip()
        if not description:
            continue
        qty = Decimal(str(row.get("quantity") or "1"))
        price = int(row.get("unit_price_cents") or 0)
        invoice.lines.append(
            InvoiceLine(
                organization_id=invoice.organization_id,
                position=index,
                description=description,
                quantity=qty,
                unit_price_cents=price,
                amount_cents=line_amount_cents(qty, price),
            )
        )
    recalc_totals(invoice)


def _money(cents: int) -> str:
    from sere.money import format_money

    return format_money(cents)

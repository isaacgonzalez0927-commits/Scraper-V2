"""Payment application. Invoice paid amounts are always summed, never incremented."""

from __future__ import annotations

from datetime import date

from sere.extensions import db
from sere.models import Invoice, Payment
from sere.services.invoices import (
    apply_payment_to_invoice,
    balance_cents,
    log_activity,
    notify,
    refresh_invoice,
)


def create_payment(
    *,
    organization_id: int,
    customer_id: int,
    amount_cents: int,
    paid_on: date,
    method: str,
    invoice_id: int | None = None,
    reference: str = "",
    notes: str = "",
) -> Payment:
    if amount_cents <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    invoice = None
    if invoice_id:
        invoice = Invoice.query.filter_by(
            id=invoice_id, organization_id=organization_id
        ).first()
        if not invoice:
            raise ValueError("Invoice not found.")
        if invoice.status == "void":
            raise ValueError("Cannot pay a void invoice.")
        refresh_invoice(invoice)
        remaining = balance_cents(invoice)
        if amount_cents > remaining:
            raise ValueError(
                "Payment is larger than the remaining balance of "
                f"{remaining / 100:.2f}."
            )
        customer_id = invoice.customer_id

    payment = Payment(
        organization_id=organization_id,
        customer_id=customer_id,
        invoice_id=invoice.id if invoice else None,
        amount_cents=amount_cents,
        paid_on=paid_on,
        method=method,
        reference=reference.strip(),
        notes=notes.strip(),
    )
    db.session.add(payment)
    db.session.flush()

    if invoice:
        apply_payment_to_invoice(invoice, payment)

    from sere.models import Customer

    customer = db.session.get(Customer, customer_id)
    name = customer.display_name if customer else "customer"
    number = invoice.number if invoice else "unapplied"
    log_activity(
        organization_id,
        "payment_received",
        f"Payment received from {name}"
        + (f" · {number}" if invoice else ""),
        amount_cents,
        f"/payments/{payment.id}",
    )
    notify(
        organization_id,
        "payment_received",
        f"Payment received — {_money(amount_cents)}",
        f"{name} paid {_money(amount_cents)}"
        + (f" on {invoice.number}" if invoice else ""),
        f"/payments/{payment.id}",
    )
    return payment


def void_payment(payment: Payment) -> None:
    if payment.voided_at:
        return
    payment.voided_at = __import__("sere.models", fromlist=["utcnow"]).utcnow()
    if payment.invoice:
        refresh_invoice(payment.invoice)


def _money(cents: int) -> str:
    from sere.money import format_money

    return format_money(cents)

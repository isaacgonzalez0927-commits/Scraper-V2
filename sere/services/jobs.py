"""Job status, costs, and invoice generation."""

from __future__ import annotations

from datetime import date, timedelta

from sere.extensions import db
from sere.models import Invoice, Job, Organization
from sere.money import line_amount_cents
from sere.services.invoices import (
    add_event,
    allocate_number,
    log_activity,
    recalc_totals,
    refresh_invoice,
)


def actual_cost_cents(job: Job) -> int:
    return sum(c.amount_cents for c in job.costs)


def job_revenue_cents(job: Job) -> int:
    billed = [
        inv.total_cents
        for inv in job.invoices
        if inv.status not in ("void", "draft")
    ]
    if billed:
        return sum(billed)
    if job.actual_revenue_cents:
        return job.actual_revenue_cents
    return job.estimated_revenue_cents


def job_profit_cents(job: Job) -> int:
    return job_revenue_cents(job) - actual_cost_cents(job)


def complete_job(job: Job) -> None:
    job.status = "completed"
    job.completed_at = job.completed_at or __import__(
        "sere.models", fromlist=["utcnow"]
    ).utcnow()
    log_activity(
        job.organization_id,
        "job_completed",
        f"Job completed — {job.title}",
        job_revenue_cents(job),
        f"/jobs/{job.id}",
    )


def invoice_from_job(job: Job, org: Organization) -> Invoice:
    existing = next((inv for inv in job.invoices if inv.status != "void"), None)
    if existing:
        return existing

    issue = date.today()
    invoice = Invoice(
        organization_id=job.organization_id,
        customer_id=job.customer_id,
        job_id=job.id,
        number=allocate_number(org),
        status="draft",
        issue_date=issue,
        due_date=issue + timedelta(days=org.payment_terms_days or 14),
        notes=org.default_invoice_notes or "",
        tax_bps=org.default_tax_bps or 0,
    )
    db.session.add(invoice)
    db.session.flush()

    description = job.title
    if job.description:
        description = f"{job.title} — {job.description[:120]}"
    price = job.actual_revenue_cents or job.estimated_revenue_cents
    from sere.models import InvoiceLine

    invoice.lines.append(
        InvoiceLine(
            organization_id=job.organization_id,
            position=0,
            description=description,
            quantity=1,
            unit_price_cents=price,
            amount_cents=line_amount_cents(1, price),
        )
    )
    recalc_totals(invoice)
    refresh_invoice(invoice)
    add_event(invoice, "created", f"{invoice.number} created from job")
    log_activity(
        job.organization_id,
        "invoice_created",
        f"{invoice.number} created for {job.customer.display_name}",
        invoice.total_cents,
        f"/invoices/{invoice.id}",
    )
    return invoice

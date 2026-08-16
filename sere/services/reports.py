"""Cash flow and profitability — collected cash is never mixed with invoiced revenue."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func

from sere.extensions import db
from sere.models import Invoice, Job, JobCost, Payment
from sere.services.invoices import COLLECTIBLE_STATUSES, amount_paid_cents, balance_cents
from sere.services.jobs import actual_cost_cents, job_profit_cents, job_revenue_cents


def month_bounds(day: date) -> tuple[date, date]:
    start = day.replace(day=1)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1) - timedelta(days=1)
    else:
        end = start.replace(month=start.month + 1) - timedelta(days=1)
    return start, end


def week_bounds(day: date) -> tuple[date, date]:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def period_bounds(key: str, today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    if key == "this_week":
        return week_bounds(today)
    if key == "last_month":
        first, _ = month_bounds(today)
        prev = first - timedelta(days=1)
        return month_bounds(prev)
    if key == "this_month":
        return month_bounds(today)
    return month_bounds(today)


def collected_cents(
    organization_id: int, start: date | None = None, end: date | None = None
) -> int:
    query = Payment.query.filter(
        Payment.organization_id == organization_id,
        Payment.voided_at.is_(None),
    )
    if start:
        query = query.filter(Payment.paid_on >= start)
    if end:
        query = query.filter(Payment.paid_on <= end)
    return int(query.with_entities(func.coalesce(func.sum(Payment.amount_cents), 0)).scalar() or 0)


def invoiced_revenue_cents(
    organization_id: int, start: date | None = None, end: date | None = None
) -> int:
    query = Invoice.query.filter(
        Invoice.organization_id == organization_id,
        Invoice.status.in_(COLLECTIBLE_STATUSES),
    )
    if start:
        query = query.filter(Invoice.issue_date >= start)
    if end:
        query = query.filter(Invoice.issue_date <= end)
    return int(query.with_entities(func.coalesce(func.sum(Invoice.total_cents), 0)).scalar() or 0)


def outstanding_cents(organization_id: int) -> tuple[int, int]:
    invoices = Invoice.query.filter(
        Invoice.organization_id == organization_id,
        Invoice.status.in_(("sent", "viewed", "partial", "overdue")),
    ).all()
    open_total = 0
    overdue_total = 0
    today = date.today()
    for invoice in invoices:
        remaining = balance_cents(invoice)
        open_total += remaining
        if invoice.due_date and invoice.due_date < today:
            overdue_total += remaining
    return open_total, overdue_total


def expected_cash(organization_id: int) -> list[dict]:
    invoices = Invoice.query.filter(
        Invoice.organization_id == organization_id,
        Invoice.status.in_(("sent", "viewed", "partial", "overdue")),
    ).order_by(Invoice.due_date).all()
    buckets: dict[date, int] = defaultdict(int)
    for invoice in invoices:
        buckets[invoice.due_date] += balance_cents(invoice)
    return [
        {"date": day, "amount_cents": amount}
        for day, amount in sorted(buckets.items())
        if amount > 0
    ]


def customer_lifetime_cents(organization_id: int, customer_id: int) -> int:
    return int(
        Payment.query.filter(
            Payment.organization_id == organization_id,
            Payment.customer_id == customer_id,
            Payment.voided_at.is_(None),
        )
        .with_entities(func.coalesce(func.sum(Payment.amount_cents), 0))
        .scalar()
        or 0
    )


def customer_balance_cents(organization_id: int, customer_id: int) -> int:
    invoices = Invoice.query.filter(
        Invoice.organization_id == organization_id,
        Invoice.customer_id == customer_id,
        Invoice.status.in_(("sent", "viewed", "partial", "overdue")),
    ).all()
    return sum(balance_cents(inv) for inv in invoices)


def completed_job_stats(organization_id: int, start: date | None = None, end: date | None = None):
    query = Job.query.filter(
        Job.organization_id == organization_id,
        Job.status == "completed",
    )
    if start:
        query = query.filter(Job.completed_at >= start)
    if end:
        query = query.filter(Job.completed_at < end + timedelta(days=1))
    jobs = query.all()
    rows = []
    for job in jobs:
        revenue = job_revenue_cents(job)
        cost = actual_cost_cents(job)
        rows.append(
            {
                "job": job,
                "revenue_cents": revenue,
                "cost_cents": cost,
                "profit_cents": revenue - cost,
            }
        )
    return rows


def estimated_profit_this_month(organization_id: int, today: date | None = None) -> int:
    start, end = month_bounds(today or date.today())
    jobs = Job.query.filter(
        Job.organization_id == organization_id,
        Job.status.in_(("scheduled", "in_progress", "completed")),
    ).all()
    profit = 0
    for job in jobs:
        stamp = (job.completed_at.date() if job.completed_at else None) or (
            job.scheduled_start.date() if job.scheduled_start else None
        )
        if not stamp or stamp < start or stamp > end:
            continue
        profit += job_profit_cents(job)
    return profit

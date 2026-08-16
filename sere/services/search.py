"""Organization-scoped global search."""

from __future__ import annotations

from sqlalchemy import or_

from sere.models import Customer, Invoice, Job


def search_org(organization_id: int, query: str, limit: int = 12) -> dict:
    q = (query or "").strip()
    if len(q) < 2:
        return {"customers": [], "jobs": [], "invoices": []}

    like = f"%{q}%"
    customers = (
        Customer.query.filter(
            Customer.organization_id == organization_id,
            Customer.archived_at.is_(None),
            or_(
                Customer.name.ilike(like),
                Customer.company_name.ilike(like),
                Customer.email.ilike(like),
                Customer.phone.ilike(like),
                Customer.service_line1.ilike(like),
                Customer.billing_line1.ilike(like),
                Customer.service_city.ilike(like),
            ),
        )
        .order_by(Customer.name)
        .limit(limit)
        .all()
    )
    jobs = (
        Job.query.filter(
            Job.organization_id == organization_id,
            or_(
                Job.title.ilike(like),
                Job.description.ilike(like),
                Job.service_line1.ilike(like),
                Job.technician_name.ilike(like),
            ),
        )
        .order_by(Job.updated_at.desc())
        .limit(limit)
        .all()
    )
    invoices = (
        Invoice.query.filter(
            Invoice.organization_id == organization_id,
            or_(Invoice.number.ilike(like), Invoice.notes.ilike(like)),
        )
        .order_by(Invoice.issue_date.desc())
        .limit(limit)
        .all()
    )
    return {"customers": customers, "jobs": jobs, "invoices": invoices}

"""Multi-tenant Sere models. Every business row is scoped by organization_id."""

from __future__ import annotations

import secrets
from datetime import date, datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sere.extensions import db

JOB_STATUSES = (
    "unscheduled",
    "scheduled",
    "in_progress",
    "completed",
    "cancelled",
)
INVOICE_STATUSES = (
    "draft",
    "sent",
    "viewed",
    "partial",
    "paid",
    "overdue",
    "void",
)
PAYMENT_METHODS = ("card", "ach", "cash", "check", "other")
COST_CATEGORIES = (
    "materials",
    "equipment",
    "subcontractors",
    "labor",
    "miscellaneous",
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_token(nbytes: int = 24) -> str:
    return secrets.token_urlsafe(nbytes)


class Organization(db.Model):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    address_line1: Mapped[str] = mapped_column(String(160), default="")
    address_line2: Mapped[str] = mapped_column(String(160), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    state: Mapped[str] = mapped_column(String(40), default="")
    postal_code: Mapped[str] = mapped_column(String(20), default="")
    logo_path: Mapped[str] = mapped_column(String(255), default="")
    tax_id: Mapped[str] = mapped_column(String(40), default="")
    invoice_prefix: Mapped[str] = mapped_column(String(16), default="INV-")
    next_invoice_number: Mapped[int] = mapped_column(Integer, default=1001)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=14)
    default_invoice_notes: Mapped[str] = mapped_column(Text, default="")
    default_tax_bps: Mapped[int] = mapped_column(Integer, default=0)
    stripe_account_id: Mapped[str] = mapped_column(String(80), default="")
    stripe_status: Mapped[str] = mapped_column(String(32), default="not_connected")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    memberships = relationship("Membership", back_populates="organization")
    customers = relationship("Customer", back_populates="organization")


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    memberships = relationship("Membership", back_populates="user")
    reset_tokens = relationship("PasswordReset", back_populates="user")

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_active(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    def get_id(self) -> str:
        return str(self.id)


class Membership(db.Model):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "organization_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    role: Mapped[str] = mapped_column(String(24), default="owner")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")


class PasswordReset(db.Model):
    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(80), unique=True, default=new_token)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="reset_tokens")


class Customer(db.Model):
    __tablename__ = "customers"
    __table_args__ = (
        Index("ix_customers_org_name", "organization_id", "name"),
        Index("ix_customers_org_email", "organization_id", "email"),
        Index("ix_customers_org_phone", "organization_id", "phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    company_name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    billing_line1: Mapped[str] = mapped_column(String(160), default="")
    billing_line2: Mapped[str] = mapped_column(String(160), default="")
    billing_city: Mapped[str] = mapped_column(String(80), default="")
    billing_state: Mapped[str] = mapped_column(String(40), default="")
    billing_postal: Mapped[str] = mapped_column(String(20), default="")
    service_line1: Mapped[str] = mapped_column(String(160), default="")
    service_line2: Mapped[str] = mapped_column(String(160), default="")
    service_city: Mapped[str] = mapped_column(String(80), default="")
    service_state: Mapped[str] = mapped_column(String(40), default="")
    service_postal: Mapped[str] = mapped_column(String(20), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    customer_since: Mapped[date] = mapped_column(Date, default=date.today)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    organization = relationship("Organization", back_populates="customers")
    jobs = relationship("Job", back_populates="customer")
    invoices = relationship("Invoice", back_populates="customer")
    payments = relationship("Payment", back_populates="customer")

    @property
    def display_name(self) -> str:
        if self.company_name and self.company_name != self.name:
            return f"{self.name} · {self.company_name}"
        return self.company_name or self.name

    @property
    def service_address(self) -> str:
        return format_address(
            self.service_line1,
            self.service_line2,
            self.service_city,
            self.service_state,
            self.service_postal,
        )

    @property
    def billing_address(self) -> str:
        return format_address(
            self.billing_line1,
            self.billing_line2,
            self.billing_city,
            self.billing_state,
            self.billing_postal,
        )


class Job(db.Model):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_org_status", "organization_id", "status"),
        Index("ix_jobs_org_start", "organization_id", "scheduled_start"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    service_line1: Mapped[str] = mapped_column(String(160), default="")
    service_line2: Mapped[str] = mapped_column(String(160), default="")
    service_city: Mapped[str] = mapped_column(String(80), default="")
    service_state: Mapped[str] = mapped_column(String(40), default="")
    service_postal: Mapped[str] = mapped_column(String(20), default="")
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="unscheduled")
    technician_name: Mapped[str] = mapped_column(String(120), default="")
    estimated_revenue_cents: Mapped[int] = mapped_column(Integer, default=0)
    actual_revenue_cents: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    customer = relationship("Customer", back_populates="jobs")
    costs = relationship("JobCost", back_populates="job", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="job")

    @property
    def service_address(self) -> str:
        return format_address(
            self.service_line1,
            self.service_line2,
            self.service_city,
            self.service_state,
            self.service_postal,
        )


class JobCost(db.Model):
    __tablename__ = "job_costs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    category: Mapped[str] = mapped_column(String(32), default="miscellaneous")
    description: Mapped[str] = mapped_column(String(200), default="")
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    job = relationship("Job", back_populates="costs")


class Note(db.Model):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id"), nullable=True, index=True
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id"), nullable=True, index=True
    )
    body: Mapped[str] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    author = relationship("User")


class Attachment(db.Model):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id"), nullable=True, index=True
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ServiceItem(db.Model):
    __tablename__ = "service_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(255), default="")
    unit_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Invoice(db.Model):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("organization_id", "number"),
        Index("ix_invoices_org_status", "organization_id", "status"),
        Index("ix_invoices_public", "public_token"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id"), nullable=True, index=True
    )
    number: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24), default="draft")
    issue_date: Mapped[date] = mapped_column(Date, default=date.today)
    due_date: Mapped[date] = mapped_column(Date, default=date.today)
    notes: Mapped[str] = mapped_column(Text, default="")
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    tax_bps: Mapped[int] = mapped_column(Integer, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0)
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)
    public_token: Mapped[str] = mapped_column(String(80), unique=True, default=new_token)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    customer = relationship("Customer", back_populates="invoices")
    job = relationship("Job", back_populates="invoices")
    lines = relationship(
        "InvoiceLine",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLine.position",
    )
    payments = relationship("Payment", back_populates="invoice")
    events = relationship(
        "InvoiceEvent",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceEvent.created_at",
    )


class InvoiceLine(db.Model):
    __tablename__ = "invoice_lines"
    __table_args__ = (
        CheckConstraint("unit_price_cents >= 0", name="ck_line_price_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[Numeric] = mapped_column(Numeric(12, 3), default=1)
    unit_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)

    invoice = relationship("Invoice", back_populates="lines")


class Payment(db.Model):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_payment_positive"),
        Index("ix_payments_org_date", "organization_id", "paid_on"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    paid_on: Mapped[date] = mapped_column(Date, default=date.today)
    method: Mapped[str] = mapped_column(String(24), default="card")
    reference: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    customer = relationship("Customer", back_populates="payments")
    invoice = relationship("Invoice", back_populates="payments")


class InvoiceEvent(db.Model):
    __tablename__ = "invoice_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(String(255))
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    invoice = relationship("Invoice", back_populates="events")


class Notification(db.Model):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notes_org_read", "organization_id", "read_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(400), default="")
    link: Mapped[str] = mapped_column(String(200), default="")
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Activity(db.Model):
    __tablename__ = "activities"
    __table_args__ = (Index("ix_activity_org_created", "organization_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    link: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def format_address(
    line1: str,
    line2: str,
    city: str,
    state: str,
    postal: str,
) -> str:
    parts = [p for p in (line1, line2) if p]
    city_line = ", ".join(p for p in (city, " ".join(x for x in (state, postal) if x)) if p)
    if city_line:
        parts.append(city_line)
    return ", ".join(parts)

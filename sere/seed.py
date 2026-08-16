"""Realistic Harbor Air sample data so every screen can be judged visually."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from werkzeug.security import generate_password_hash

from sere.extensions import db
from sere.models import (
    Activity,
    Customer,
    Invoice,
    InvoiceEvent,
    InvoiceLine,
    Job,
    JobCost,
    Membership,
    Note,
    Notification,
    Organization,
    Payment,
    ServiceItem,
    User,
)
from sere.money import format_money, line_amount_cents, tax_cents
from sere.services.invoices import derive_status

DEMO_EMAIL = "owner@sere.cash"
DEMO_PASSWORD = "harborair"


def seed_if_empty() -> None:
    if User.query.filter_by(email=DEMO_EMAIL).first():
        return
    seed_harbor_air()


def seed_harbor_air() -> Organization:
    today = date.today()
    now = datetime.now()

    org = Organization(
        name="Harbor Air",
        slug="harbor-air",
        phone="(239) 555-0148",
        email="hello@harborair.example",
        address_line1="1840 Fowler St",
        city="Fort Myers",
        state="FL",
        postal_code="33901",
        tax_id="27-4419021",
        invoice_prefix="INV-",
        next_invoice_number=1050,
        payment_terms_days=14,
        default_invoice_notes="Thank you for trusting Harbor Air. Payment is due within 14 days.",
        default_tax_bps=650,
        stripe_status="not_connected",
    )
    owner = User(
        name="Elena Vasquez",
        email=DEMO_EMAIL,
        password_hash=generate_password_hash(DEMO_PASSWORD),
    )
    db.session.add_all([org, owner])
    db.session.flush()
    db.session.add(Membership(user_id=owner.id, organization_id=org.id, role="owner"))

    catalog = [
        ("Diagnostic visit", "After-hours or same-day inspection", 12900),
        ("AC tune-up", "Seasonal clean and performance check", 18900),
        ("Capacitor replacement", "Run / start capacitor, parts and labor", 28500),
        ("Condenser clean", "Outdoor coil wash and rinse", 24000),
        ("3-ton AC replacement", "Equipment, line set, and startup", 780000),
        ("Duct sealing", "Aeroseal-style leak reduction, per system", 145000),
        ("Thermostat install", "Smart thermostat + programming", 34900),
        ("Emergency after-hours labor", "Nights and weekends, first hour", 19500),
    ]
    for name, description, price in catalog:
        db.session.add(
            ServiceItem(
                organization_id=org.id,
                name=name,
                description=description,
                unit_price_cents=price,
            )
        )

    customers = {
        "john": Customer(
            organization_id=org.id,
            name="John Smith",
            email="john.smith@example.com",
            phone="(239) 555-2201",
            billing_line1="412 Palm Court",
            billing_city="Cape Coral",
            billing_state="FL",
            billing_postal="33904",
            service_line1="412 Palm Court",
            service_city="Cape Coral",
            service_state="FL",
            service_postal="33904",
            notes="Prefers morning appointments. Gate code 4412.",
            customer_since=date(2023, 4, 12),
        ),
        "coastal": Customer(
            organization_id=org.id,
            name="Priya Shah",
            company_name="Coastal Dental",
            email="office@coastaldental.example",
            phone="(239) 555-8810",
            billing_line1="900 Colonial Blvd",
            billing_line2="Suite 110",
            billing_city="Fort Myers",
            billing_state="FL",
            billing_postal="33907",
            service_line1="900 Colonial Blvd",
            service_line2="Suite 110",
            service_city="Fort Myers",
            service_state="FL",
            service_postal="33907",
            notes="After-hours work only. Building manager: Luis.",
            customer_since=date(2022, 11, 3),
        ),
        "maria": Customer(
            organization_id=org.id,
            name="Maria Alvarez",
            email="maria.alvarez@example.com",
            phone="(239) 555-0194",
            billing_line1="18 Mangrove Lane",
            billing_city="Estero",
            billing_state="FL",
            billing_postal="33928",
            service_line1="18 Mangrove Lane",
            service_city="Estero",
            service_state="FL",
            service_postal="33928",
            notes="Two systems — upstairs air handler is older.",
            customer_since=date(2024, 1, 20),
        ),
        "riverside": Customer(
            organization_id=org.id,
            name="Tom Nguyen",
            company_name="Riverside Property Group",
            email="tom@riversidepg.example",
            phone="(239) 555-7740",
            billing_line1="50 Hendry St",
            billing_city="Fort Myers",
            billing_state="FL",
            billing_postal="33901",
            service_line1="211 River Rd",
            service_city="North Fort Myers",
            service_state="FL",
            service_postal="33903",
            notes="Pays by ACH. Send invoices to accounting@riversidepg.example as well.",
            customer_since=date(2021, 8, 9),
        ),
        "chen": Customer(
            organization_id=org.id,
            name="Wei Chen",
            company_name="The Chen Residence",
            email="wei.chen@example.com",
            phone="(239) 555-3366",
            billing_line1="77 Caloosa Dr",
            billing_city="Sanibel",
            billing_state="FL",
            billing_postal="33957",
            service_line1="77 Caloosa Dr",
            service_city="Sanibel",
            service_state="FL",
            service_postal="33957",
            customer_since=date(2025, 6, 2),
        ),
        "bakery": Customer(
            organization_id=org.id,
            name="Hannah Cole",
            company_name="Oak Street Bakery",
            email="hannah@oakstreetbakery.example",
            phone="(239) 555-0912",
            billing_line1="14 Oak St",
            billing_city="Fort Myers",
            billing_state="FL",
            billing_postal="33901",
            service_line1="14 Oak St",
            service_city="Fort Myers",
            service_state="FL",
            service_postal="33901",
            notes="Walk-in cooler and dining AC are separate systems.",
            customer_since=date(2024, 9, 14),
        ),
        "patel": Customer(
            organization_id=org.id,
            name="James Patel",
            email="james.patel@example.com",
            phone="(239) 555-4488",
            billing_line1="1208 Sabal Palm Way",
            billing_city="Bonita Springs",
            billing_state="FL",
            billing_postal="34135",
            service_line1="1208 Sabal Palm Way",
            service_city="Bonita Springs",
            service_state="FL",
            service_postal="34135",
            customer_since=date(2023, 12, 1),
        ),
        "inn": Customer(
            organization_id=org.id,
            name="Diane Brooks",
            company_name="Sunset Inn",
            email="front@sunsetinn.example",
            phone="(239) 555-6002",
            billing_line1="2400 Estero Blvd",
            billing_city="Fort Myers Beach",
            billing_state="FL",
            billing_postal="33931",
            service_line1="2400 Estero Blvd",
            service_city="Fort Myers Beach",
            service_state="FL",
            service_postal="33931",
            notes="12 PTAC units. Ask for maintenance closet key at front desk.",
            customer_since=date(2022, 3, 18),
        ),
    }
    db.session.add_all(customers.values())
    db.session.flush()

    def dt(days: int, hour: int = 9, minute: int = 0) -> datetime:
        base = datetime.combine(today + timedelta(days=days), datetime.min.time())
        return base.replace(hour=hour, minute=minute)

    jobs = {
        "ac_replace": Job(
            organization_id=org.id,
            customer_id=customers["john"].id,
            title="AC replacement",
            description="Replace failed 3-ton condenser and matching air handler.",
            service_line1="412 Palm Court",
            service_city="Cape Coral",
            service_state="FL",
            service_postal="33904",
            scheduled_start=dt(-12, 8),
            scheduled_end=dt(-12, 16),
            status="completed",
            technician_name="Marcus Hale",
            estimated_revenue_cents=840000,
            actual_revenue_cents=840000,
            estimated_cost_cents=510000,
            completed_at=now - timedelta(days=12),
        ),
        "coastal_today": Job(
            organization_id=org.id,
            customer_id=customers["coastal"].id,
            title="Suite 110 no-cool",
            description="Waiting room is 81°. Check TXV and filters before quoting a compressor.",
            service_line1="900 Colonial Blvd",
            service_line2="Suite 110",
            service_city="Fort Myers",
            service_state="FL",
            service_postal="33907",
            scheduled_start=dt(0, 10),
            scheduled_end=dt(0, 12),
            status="in_progress",
            technician_name="Marcus Hale",
            estimated_revenue_cents=42000,
            estimated_cost_cents=9000,
        ),
        "maria_week": Job(
            organization_id=org.id,
            customer_id=customers["maria"].id,
            title="Upstairs air handler service",
            description="Annual service plus a noisy blower motor.",
            service_line1="18 Mangrove Lane",
            service_city="Estero",
            service_state="FL",
            service_postal="33928",
            scheduled_start=dt(2, 13),
            scheduled_end=dt(2, 15),
            status="scheduled",
            technician_name="Sofia Rios",
            estimated_revenue_cents=36500,
            estimated_cost_cents=11000,
        ),
        "bakery_done": Job(
            organization_id=org.id,
            customer_id=customers["bakery"].id,
            title="Walk-in cooler repair",
            description="Replaced start capacitor and cleaned condenser.",
            service_line1="14 Oak St",
            service_city="Fort Myers",
            service_state="FL",
            service_postal="33901",
            scheduled_start=dt(-3, 7),
            scheduled_end=dt(-3, 9),
            status="completed",
            technician_name="Sofia Rios",
            estimated_revenue_cents=28500,
            actual_revenue_cents=28500,
            estimated_cost_cents=6200,
            completed_at=now - timedelta(days=3),
        ),
        "riverside_await": Job(
            organization_id=org.id,
            customer_id=customers["riverside"].id,
            title="Building 2 condenser clean",
            description="Quarterly clean on the west unit. Waiting on roof access.",
            service_line1="211 River Rd",
            service_city="North Fort Myers",
            service_state="FL",
            service_postal="33903",
            status="unscheduled",
            estimated_revenue_cents=24000,
            estimated_cost_cents=4000,
        ),
        "chen_install": Job(
            organization_id=org.id,
            customer_id=customers["chen"].id,
            title="Smart thermostat install",
            scheduled_start=dt(1, 11),
            scheduled_end=dt(1, 12),
            status="scheduled",
            technician_name="Sofia Rios",
            estimated_revenue_cents=34900,
            estimated_cost_cents=14000,
            service_line1="77 Caloosa Dr",
            service_city="Sanibel",
            service_state="FL",
            service_postal="33957",
        ),
        "inn_week": Job(
            organization_id=org.id,
            customer_id=customers["inn"].id,
            title="PTAC round — rooms 8 through 12",
            description="Filters, coils, and two noisy fans.",
            service_line1="2400 Estero Blvd",
            service_city="Fort Myers Beach",
            service_state="FL",
            service_postal="33931",
            scheduled_start=dt(4, 8),
            scheduled_end=dt(4, 15),
            status="scheduled",
            technician_name="Marcus Hale",
            estimated_revenue_cents=186000,
            estimated_cost_cents=54000,
        ),
        "patel_done": Job(
            organization_id=org.id,
            customer_id=customers["patel"].id,
            title="Capacitor and contactor",
            scheduled_start=dt(-20, 14),
            scheduled_end=dt(-20, 15),
            status="completed",
            technician_name="Marcus Hale",
            estimated_revenue_cents=38500,
            actual_revenue_cents=38500,
            estimated_cost_cents=9800,
            completed_at=now - timedelta(days=20),
            service_line1="1208 Sabal Palm Way",
            service_city="Bonita Springs",
            service_state="FL",
            service_postal="34135",
        ),
    }
    db.session.add_all(jobs.values())
    db.session.flush()

    costs = [
        JobCost(organization_id=org.id, job_id=jobs["ac_replace"].id, category="equipment", description="3-ton condenser + air handler", amount_cents=428000),
        JobCost(organization_id=org.id, job_id=jobs["ac_replace"].id, category="materials", description="Line set, pad, whip, disconnect", amount_cents=41200),
        JobCost(organization_id=org.id, job_id=jobs["ac_replace"].id, category="labor", description="Two-man install, 8 hours", amount_cents=96000),
        JobCost(organization_id=org.id, job_id=jobs["ac_replace"].id, category="miscellaneous", description="Permit and disposal", amount_cents=18500),
        JobCost(organization_id=org.id, job_id=jobs["bakery_done"].id, category="materials", description="Start capacitor", amount_cents=2800),
        JobCost(organization_id=org.id, job_id=jobs["bakery_done"].id, category="labor", description="Morning service call", amount_cents=3400),
        JobCost(organization_id=org.id, job_id=jobs["patel_done"].id, category="materials", description="Capacitor and contactor", amount_cents=4200),
        JobCost(organization_id=org.id, job_id=jobs["patel_done"].id, category="labor", description="Afternoon call", amount_cents=5600),
        JobCost(organization_id=org.id, job_id=jobs["coastal_today"].id, category="labor", description="Diagnostic so far", amount_cents=4500),
    ]
    db.session.add_all(costs)

    def make_invoice(
        number: str,
        customer: Customer,
        job: Job | None,
        issue: date,
        due: date,
        status: str,
        lines: list[tuple[str, Decimal, int]],
        discount: int = 0,
        tax_bps: int = 650,
        sent_days: int | None = None,
        viewed_days: int | None = None,
    ) -> Invoice:
        invoice = Invoice(
            organization_id=org.id,
            customer_id=customer.id,
            job_id=job.id if job else None,
            number=number,
            status=status,
            issue_date=issue,
            due_date=due,
            notes=org.default_invoice_notes,
            discount_cents=discount,
            tax_bps=tax_bps,
            sent_at=now - timedelta(days=sent_days) if sent_days is not None else None,
            viewed_at=now - timedelta(days=viewed_days) if viewed_days is not None else None,
        )
        db.session.add(invoice)
        db.session.flush()
        subtotal = 0
        for index, (desc, qty, price) in enumerate(lines):
            amount = line_amount_cents(qty, price)
            subtotal += amount
            db.session.add(
                InvoiceLine(
                    organization_id=org.id,
                    invoice_id=invoice.id,
                    position=index,
                    description=desc,
                    quantity=qty,
                    unit_price_cents=price,
                    amount_cents=amount,
                )
            )
        invoice.subtotal_cents = subtotal
        invoice.discount_cents = discount
        invoice.tax_cents = tax_cents(subtotal - discount, tax_bps)
        invoice.total_cents = subtotal - discount + invoice.tax_cents
        return invoice

    inv_1042 = make_invoice(
        "INV-1042",
        customers["john"],
        jobs["ac_replace"],
        today - timedelta(days=14),
        today - timedelta(days=0),
        "paid",
        [("3-ton AC replacement — equipment, line set, and startup", Decimal("1"), 780000),
         ("Smart thermostat install", Decimal("1"), 34900),
         ("Permit and haul-away", Decimal("1"), 25100)],
        sent_days=14,
        viewed_days=13,
    )
    inv_1043 = make_invoice(
        "INV-1043",
        customers["patel"],
        jobs["patel_done"],
        today - timedelta(days=20),
        today - timedelta(days=6),
        "paid",
        [("Capacitor replacement", Decimal("1"), 28500),
         ("Contactor", Decimal("1"), 10000)],
        sent_days=20,
        viewed_days=18,
    )
    inv_1044 = make_invoice(
        "INV-1044",
        customers["bakery"],
        jobs["bakery_done"],
        today - timedelta(days=3),
        today + timedelta(days=11),
        "sent",
        [("Walk-in cooler repair — capacitor and condenser clean", Decimal("1"), 28500)],
        sent_days=3,
    )
    inv_1045 = make_invoice(
        "INV-1045",
        customers["riverside"],
        None,
        today - timedelta(days=28),
        today - timedelta(days=14),
        "overdue",
        [("Quarterly maintenance — Building 1", Decimal("1"), 64000),
         ("Filter set, 20x25x4 MERV 13", Decimal("4"), 2800)],
        sent_days=28,
        viewed_days=21,
    )
    inv_1046 = make_invoice(
        "INV-1046",
        customers["inn"],
        None,
        today - timedelta(days=10),
        today + timedelta(days=4),
        "partial",
        [("PTAC service — rooms 1 through 7", Decimal("7"), 18500)],
        sent_days=10,
        viewed_days=8,
    )
    inv_1047 = make_invoice(
        "INV-1047",
        customers["maria"],
        None,
        today - timedelta(days=18),
        today - timedelta(days=4),
        "overdue",
        [("AC tune-up, upstairs and downstairs", Decimal("2"), 18900)],
        sent_days=18,
        viewed_days=12,
    )
    inv_1048 = make_invoice(
        "INV-1048",
        customers["chen"],
        jobs["chen_install"],
        today,
        today + timedelta(days=14),
        "draft",
        [("Smart thermostat install", Decimal("1"), 34900)],
    )
    inv_1049 = make_invoice(
        "INV-1049",
        customers["coastal"],
        jobs["coastal_today"],
        today,
        today + timedelta(days=14),
        "viewed",
        [("Diagnostic visit", Decimal("1"), 12900),
         ("After-hours labor", Decimal("1"), 19500)],
        sent_days=0,
        viewed_days=0,
    )
    db.session.flush()

    payments = [
        Payment(
            organization_id=org.id,
            customer_id=customers["john"].id,
            invoice_id=inv_1042.id,
            amount_cents=inv_1042.total_cents,
            paid_on=today - timedelta(days=2),
            method="card",
            reference="ch_4f2a91",
            notes="Paid on the public invoice link.",
        ),
        Payment(
            organization_id=org.id,
            customer_id=customers["patel"].id,
            invoice_id=inv_1043.id,
            amount_cents=inv_1043.total_cents,
            paid_on=today - timedelta(days=16),
            method="check",
            reference="4419",
        ),
        Payment(
            organization_id=org.id,
            customer_id=customers["inn"].id,
            invoice_id=inv_1046.id,
            amount_cents=50000,
            paid_on=today - timedelta(days=5),
            method="ach",
            reference="ACH-2291",
            notes="Partial — remainder next week.",
        ),
        Payment(
            organization_id=org.id,
            customer_id=customers["coastal"].id,
            invoice_id=None,
            amount_cents=12900,
            paid_on=today - timedelta(days=1),
            method="card",
            reference="ch_88c12",
            notes="Retainer for today's diagnostic. Apply when the job invoices.",
        ),
    ]
    db.session.add_all(payments)
    db.session.flush()

    for invoice in (
        inv_1042,
        inv_1043,
        inv_1044,
        inv_1045,
        inv_1046,
        inv_1047,
        inv_1048,
        inv_1049,
    ):
        invoice.status = derive_status(invoice, today=today)

    events = [
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1042.id, kind="created", message="INV-1042 created", created_at=now - timedelta(days=14)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1042.id, kind="sent", message="Sent to john.smith@example.com", created_at=now - timedelta(days=14, hours=-1)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1042.id, kind="viewed", message="Customer viewed invoice", created_at=now - timedelta(days=13)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1042.id, kind="payment", message="$8,947.65 payment received", amount_cents=inv_1042.total_cents, created_at=now - timedelta(days=2)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1042.id, kind="paid", message="INV-1042 paid in full", created_at=now - timedelta(days=2)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1047.id, kind="created", message="INV-1047 created", created_at=now - timedelta(days=18)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1047.id, kind="sent", message="Sent to maria.alvarez@example.com", created_at=now - timedelta(days=18)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1047.id, kind="viewed", message="Customer viewed invoice", created_at=now - timedelta(days=12)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1047.id, kind="overdue", message="INV-1047 became overdue", created_at=now - timedelta(days=4)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1046.id, kind="created", message="INV-1046 created", created_at=now - timedelta(days=10)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1046.id, kind="sent", message="Sent to front@sunsetinn.example", created_at=now - timedelta(days=10)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1046.id, kind="payment", message="$500.00 payment received", amount_cents=50000, created_at=now - timedelta(days=5)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1045.id, kind="overdue", message="INV-1045 became overdue", created_at=now - timedelta(days=14)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1049.id, kind="sent", message="Sent to office@coastaldental.example", created_at=now - timedelta(hours=6)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1049.id, kind="viewed", message="Customer viewed invoice", created_at=now - timedelta(hours=2)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1048.id, kind="created", message="INV-1048 created", created_at=now - timedelta(hours=3)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1044.id, kind="created", message="INV-1044 created", created_at=now - timedelta(days=3)),
        InvoiceEvent(organization_id=org.id, invoice_id=inv_1044.id, kind="sent", message="Sent to hannah@oakstreetbakery.example", created_at=now - timedelta(days=3)),
    ]
    db.session.add_all(events)

    db.session.add_all(
        [
            Note(
                organization_id=org.id,
                customer_id=customers["john"].id,
                job_id=jobs["ac_replace"].id,
                body="Homeowner approved the Goodman 3-ton after seeing the failed compressor. Asked us to keep the old thermostat until the new one is programmed.",
                created_by_id=owner.id,
                created_at=now - timedelta(days=13),
            ),
            Note(
                organization_id=org.id,
                customer_id=customers["coastal"].id,
                body="Luis will meet the tech at the rear door. Do not walk through the lobby during patient hours.",
                created_by_id=owner.id,
                created_at=now - timedelta(hours=5),
            ),
            Note(
                organization_id=org.id,
                customer_id=customers["riverside"].id,
                body="Accounting is slow this quarter. Call Tom before sending the next reminder.",
                created_by_id=owner.id,
                created_at=now - timedelta(days=8),
            ),
        ]
    )

    activities = [
        Activity(organization_id=org.id, kind="payment_received", title=f"Invoice {inv_1042.number} paid — {format_money(inv_1042.total_cents)}", amount_cents=inv_1042.total_cents, link=f"/invoices/{inv_1042.id}", created_at=now - timedelta(days=2)),
        Activity(organization_id=org.id, kind="job_created", title="New job created for Coastal Dental", link=f"/jobs/{jobs['coastal_today'].id}", created_at=now - timedelta(hours=8)),
        Activity(organization_id=org.id, kind="invoice_overdue", title=f"Invoice {inv_1047.number} became overdue", amount_cents=inv_1047.total_cents, link=f"/invoices/{inv_1047.id}", created_at=now - timedelta(days=4)),
        Activity(organization_id=org.id, kind="payment_received", title="Payment received from Coastal Dental", amount_cents=12900, link=f"/payments/{payments[3].id}", created_at=now - timedelta(days=1)),
        Activity(organization_id=org.id, kind="job_completed", title="Job completed — AC replacement", amount_cents=840000, link=f"/jobs/{jobs['ac_replace'].id}", created_at=now - timedelta(days=12)),
        Activity(organization_id=org.id, kind="job_completed", title="Job completed — Walk-in cooler repair", amount_cents=28500, link=f"/jobs/{jobs['bakery_done'].id}", created_at=now - timedelta(days=3)),
        Activity(organization_id=org.id, kind="invoice_sent", title=f"{inv_1044.number} sent to Oak Street Bakery", amount_cents=inv_1044.total_cents, link=f"/invoices/{inv_1044.id}", created_at=now - timedelta(days=3)),
        Activity(organization_id=org.id, kind="payment_received", title="Partial payment from Sunset Inn — $500.00", amount_cents=50000, link=f"/invoices/{inv_1046.id}", created_at=now - timedelta(days=5)),
    ]
    db.session.add_all(activities)

    db.session.add_all(
        [
            Notification(
                organization_id=org.id,
                kind="invoice_overdue",
                title="INV-1047 is overdue",
                body="Maria Alvarez still has an open balance.",
                link=f"/invoices/{inv_1047.id}",
                created_at=now - timedelta(days=4),
            ),
            Notification(
                organization_id=org.id,
                kind="invoice_overdue",
                title="INV-1045 is overdue",
                body="Riverside Property Group still has an open balance.",
                link=f"/invoices/{inv_1045.id}",
                created_at=now - timedelta(days=14),
            ),
            Notification(
                organization_id=org.id,
                kind="payment_received",
                title=f"Payment received — {format_money(inv_1042.total_cents)}",
                body="John Smith paid INV-1042 in full.",
                link=f"/invoices/{inv_1042.id}",
                created_at=now - timedelta(days=2),
            ),
            Notification(
                organization_id=org.id,
                kind="invoice_viewed",
                title="INV-1049 was viewed",
                body="Coastal Dental opened the invoice and has not paid.",
                link=f"/invoices/{inv_1049.id}",
                created_at=now - timedelta(hours=2),
            ),
            Notification(
                organization_id=org.id,
                kind="job_soon",
                title="Job scheduled soon",
                body="Smart thermostat install at the Chen residence is tomorrow at 11:00.",
                link=f"/jobs/{jobs['chen_install'].id}",
                created_at=now - timedelta(hours=1),
            ),
        ]
    )

    db.session.commit()
    return org

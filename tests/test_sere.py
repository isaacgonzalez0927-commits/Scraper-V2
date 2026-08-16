"""Financial integrity and multi-tenant isolation tests."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from sere import create_app
from sere.extensions import db
from sere.models import Customer, Invoice, Membership, Organization, Payment, User
from sere.money import dollars_to_cents, format_money, line_amount_cents, tax_cents
from sere.services.invoices import amount_paid_cents, balance_cents, refresh_invoice, set_lines
from sere.services.payments import create_payment


@pytest.fixture()
def app(tmp_path):
    application = create_app(
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmp_path / 'test.db'}",
        AUTO_SEED=False,
        PRESERVE_NEXUS=False,
        TESTING=True,
        SECRET_KEY="test",
        WTF_CSRF_ENABLED=False,
    )
    yield application


@pytest.fixture()
def client(app):
    return app.test_client()


def test_money_never_uses_binary_float():
    assert dollars_to_cents("10.10") == 1010
    assert dollars_to_cents("0.1") == 10
    assert dollars_to_cents("1.005") == 101
    assert line_amount_cents(Decimal("1.5"), 12900) == 19350
    assert tax_cents(10000, 650) == 650
    assert format_money(894600) == "$8,946.00"
    assert format_money(-250) == "-$2.50"


def test_signup_login_and_org_isolation(client, app):
    assert client.post(
        "/signup",
        data={
            "name": "Ada West",
            "email": "ada@example.com",
            "password": "password12",
            "company": "West Air",
        },
        follow_redirects=False,
    ).status_code == 302
    assert client.get("/overview").status_code == 200

    client.post("/logout")
    assert client.post(
        "/signup",
        data={
            "name": "Ben Cole",
            "email": "ben@example.com",
            "password": "password12",
            "company": "Cole Comfort",
        },
    ).status_code == 302

    with app.app_context():
        orgs = Organization.query.all()
        assert len(orgs) == 2
        west = Organization.query.filter_by(name="West Air").one()
        customer = Customer(
            organization_id=west.id,
            name="Hidden Customer",
            email="hidden@example.com",
        )
        db.session.add(customer)
        db.session.commit()
        hidden_id = customer.id

    # Ben is logged in — must not see Ada's customer
    assert client.get(f"/customers/{hidden_id}").status_code == 404


def test_invoice_partial_payment_and_overpay(app):
    with app.app_context():
        org, customer, invoice = _invoice(app, total_lines=[("Tune-up", 1, 20000)])
        refresh_invoice(invoice)
        assert invoice.total_cents == 20000
        assert balance_cents(invoice) == 20000

        create_payment(
            organization_id=org.id,
            customer_id=customer.id,
            invoice_id=invoice.id,
            amount_cents=5000,
            paid_on=date.today(),
            method="check",
        )
        refresh_invoice(invoice)
        assert amount_paid_cents(invoice) == 5000
        assert balance_cents(invoice) == 15000
        assert invoice.status == "partial"

        with pytest.raises(ValueError):
            create_payment(
                organization_id=org.id,
                customer_id=customer.id,
                invoice_id=invoice.id,
                amount_cents=20000,
                paid_on=date.today(),
                method="card",
            )

        create_payment(
            organization_id=org.id,
            customer_id=customer.id,
            invoice_id=invoice.id,
            amount_cents=15000,
            paid_on=date.today(),
            method="card",
        )
        refresh_invoice(invoice)
        assert invoice.status == "paid"
        assert balance_cents(invoice) == 0
        db.session.commit()


def test_overdue_from_due_date_and_balance(app):
    with app.app_context():
        org, customer, invoice = _invoice(app, total_lines=[("Visit", 1, 10000)])
        invoice.due_date = date.today() - timedelta(days=2)
        invoice.sent_at = invoice.created_at
        refresh_invoice(invoice)
        assert invoice.status == "overdue"
        create_payment(
            organization_id=org.id,
            customer_id=customer.id,
            invoice_id=invoice.id,
            amount_cents=10000,
            paid_on=date.today(),
            method="cash",
        )
        refresh_invoice(invoice)
        assert invoice.status == "paid"


def test_job_to_invoice_to_payment_pages(client, app):
    client.post(
        "/signup",
        data={
            "name": "Elena",
            "email": "elena@example.com",
            "password": "password12",
            "company": "Harbor Test",
        },
    )
    assert client.get("/customers/new").status_code == 200
    client.post(
        "/customers/new",
        data={"name": "John Smith", "phone": "2395552201", "email": "john@example.com"},
        follow_redirects=True,
    )
    with app.app_context():
        customer = Customer.query.filter_by(name="John Smith").one()
        cid = customer.id
    client.post(
        "/jobs/new",
        data={
            "customer_id": str(cid),
            "title": "AC replacement",
            "status": "completed",
            "estimated_revenue": "840.00",
        },
        follow_redirects=True,
    )
    with app.app_context():
        from sere.models import Job

        job = Job.query.filter_by(title="AC replacement").one()
        jid = job.id
    assert client.post(f"/jobs/{jid}/invoice", follow_redirects=True).status_code == 200
    with app.app_context():
        invoice = Invoice.query.filter_by(job_id=jid).one()
        iid = invoice.id
        assert invoice.total_cents > 0
        assert invoice.status == "draft"
    page = client.get(f"/invoices/{iid}")
    assert page.status_code == 200
    assert b"INV-" in page.data
    client.post(
        "/payments/new",
        data={
            "invoice_id": str(iid),
            "customer_id": str(cid),
            "amount": "100.00",
            "paid_on": date.today().isoformat(),
            "method": "card",
        },
        follow_redirects=True,
    )
    with app.app_context():
        invoice = db.session.get(Invoice, iid)
        refresh_invoice(invoice)
        assert invoice.status == "partial"
        assert amount_paid_cents(invoice) == 10000


def _invoice(app, total_lines):
    org = Organization(name="Test Co", slug="test-co")
    user = User(name="Owner", email="owner@test.example", password_hash="x")
    db.session.add_all([org, user])
    db.session.flush()
    db.session.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
    customer = Customer(organization_id=org.id, name="Pat Customer")
    db.session.add(customer)
    db.session.flush()
    invoice = Invoice(
        organization_id=org.id,
        customer_id=customer.id,
        number="INV-1",
        status="sent",
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=14),
    )
    db.session.add(invoice)
    db.session.flush()
    set_lines(
        invoice,
        [
            {
                "description": desc,
                "quantity": qty,
                "unit_price_cents": price,
            }
            for desc, qty, price in total_lines
        ],
    )
    db.session.commit()
    return org, customer, invoice

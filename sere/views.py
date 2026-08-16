"""Sere HTTP routes — one connected workflow from customer to cash."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import (
    Blueprint,
    abort,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    send_from_directory,
    url_for,
)
from sqlalchemy import func, or_
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from sere.auth import (
    hash_password,
    login_required,
    login_user,
    logout_user,
    org_get,
    verify_password,
)
from sere.extensions import db
from sere.helpers import (
    STATUS_LABELS,
    cents_field,
    copy_service_address,
    date_field,
    datetime_field,
    field,
    int_field,
    qty_field,
)
from sere.models import (
    COST_CATEGORIES,
    INVOICE_STATUSES,
    JOB_STATUSES,
    PAYMENT_METHODS,
    Attachment,
    Customer,
    Invoice,
    InvoiceLine,
    Job,
    JobCost,
    Membership,
    Note,
    Notification,
    Organization,
    PasswordReset,
    Payment,
    ServiceItem,
    User,
    new_token,
    utcnow,
)
from sere.money import dollars_to_cents, format_money
from sere.seed import DEMO_EMAIL, DEMO_PASSWORD
from sere.services.invoices import (
    add_event,
    allocate_number,
    amount_paid_cents,
    balance_cents,
    log_activity,
    mark_sent,
    mark_viewed,
    notify,
    refresh_invoice,
    refresh_open_invoices,
    set_lines,
    void_invoice,
)
from sere.services.jobs import (
    actual_cost_cents,
    complete_job,
    invoice_from_job,
    job_profit_cents,
    job_revenue_cents,
)
from sere.services.mail import send_email, smtp_configured
from sere.services.payments import create_payment, void_payment
from sere.services.pdf import invoice_pdf
from sere.services.reports import (
    collected_cents,
    customer_balance_cents,
    customer_lifetime_cents,
    estimated_profit_this_month,
    expected_cash,
    invoiced_revenue_cents,
    month_bounds,
    outstanding_cents,
    period_bounds,
    week_bounds,
)
from sere.services.search import search_org

bp = Blueprint(
    "sere",
    __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="/sere-assets",
)


def render(name: str, **ctx):
    unread = 0
    if g.get("org"):
        unread = (
            Notification.query.filter_by(organization_id=g.org.id, read_at=None).count()
        )
    ctx.setdefault("unread_count", unread)
    ctx.setdefault("labels", STATUS_LABELS)
    ctx.setdefault("money", format_money)
    return render_template(name, **ctx)


@bp.get("/")
def landing():
    if g.user and g.org:
        return redirect(url_for("sere.overview"))
    return render("sere/landing.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = field("email").lower()
        password = field("password")
        user = User.query.filter(func.lower(User.email) == email).first()
        if not user or not verify_password(user, password):
            flash("That email or password is not right.", "error")
            return render("sere/auth/login.html"), 400
        login_user(user)
        nxt = request.args.get("next") or url_for("sere.overview")
        if not nxt.startswith("/"):
            nxt = url_for("sere.overview")
        return redirect(nxt)
    return render("sere/auth/login.html")


@bp.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = field("name")
        email = field("email").lower()
        password = field("password")
        company = field("company")
        if not name or not email or not password or not company:
            flash("Name, email, password, and company are required.", "error")
            return render("sere/auth/signup.html"), 400
        if len(password) < 8:
            flash("Use a password with at least 8 characters.", "error")
            return render("sere/auth/signup.html"), 400
        if User.query.filter(func.lower(User.email) == email).first():
            flash("An account with that email already exists.", "error")
            return render("sere/auth/signup.html"), 400
        user = User(name=name, email=email, password_hash=hash_password(password))
        org = Organization(
            name=company,
            slug=_unique_slug(company),
            email=email,
        )
        db.session.add_all([user, org])
        db.session.flush()
        db.session.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
        _default_services(org.id)
        db.session.commit()
        login_user(user, org)
        flash("Welcome to Sere. Add a customer to get started.", "success")
        return redirect(url_for("sere.overview"))
    return render("sere/auth/signup.html")


@bp.route("/forgot", methods=["GET", "POST"])
def forgot():
    reset_url = None
    if request.method == "POST":
        email = field("email").lower()
        user = User.query.filter(func.lower(User.email) == email).first()
        if user:
            token = PasswordReset(
                user_id=user.id,
                token=new_token(),
                expires_at=utcnow() + timedelta(hours=2),
            )
            db.session.add(token)
            db.session.commit()
            reset_url = url_for("sere.reset", token=token.token, _external=True)
            result = send_email(
                user.email,
                "Reset your Sere password",
                f"Reset your password: {reset_url}\nThis link expires in two hours.",
            )
            if result["ok"]:
                flash("Check your email for a reset link.", "success")
                reset_url = None
            else:
                flash(result["reason"], "error")
        else:
            flash("If that email is on file, a reset link is ready.", "success")
    return render("sere/auth/forgot.html", reset_url=reset_url)


@bp.route("/reset/<token>", methods=["GET", "POST"])
def reset(token: str):
    row = PasswordReset.query.filter_by(token=token, used_at=None).first()
    if not row or row.expires_at < utcnow():
        flash("That reset link is expired. Request a new one.", "error")
        return redirect(url_for("sere.forgot"))
    if request.method == "POST":
        password = field("password")
        if len(password) < 8:
            flash("Use a password with at least 8 characters.", "error")
            return render("sere/auth/reset.html")
        row.user.password_hash = hash_password(password)
        row.used_at = utcnow()
        db.session.commit()
        flash("Password updated. Sign in.", "success")
        return redirect(url_for("sere.login"))
    return render("sere/auth/reset.html")


@bp.post("/logout")
def logout():
    logout_user()
    return redirect(url_for("sere.landing"))


@bp.route("/onboarding", methods=["GET", "POST"])
def onboarding():
    if not g.user:
        return redirect(url_for("sere.login"))
    if g.org:
        return redirect(url_for("sere.overview"))
    if request.method == "POST":
        company = field("company")
        if not company:
            flash("Company name is required.", "error")
            return render("sere/auth/onboarding.html")
        org = Organization(name=company, slug=_unique_slug(company), email=g.user.email)
        db.session.add(org)
        db.session.flush()
        db.session.add(Membership(user_id=g.user.id, organization_id=org.id, role="owner"))
        _default_services(org.id)
        db.session.commit()
        login_user(g.user, org)
        return redirect(url_for("sere.overview"))
    return render("sere/auth/onboarding.html")


@bp.get("/overview")
@login_required
def overview():
    refresh_open_invoices(g.org.id)
    db.session.commit()
    today = date.today()
    start, end = month_bounds(today)
    week_start, week_end = week_bounds(today)
    revenue = invoiced_revenue_cents(g.org.id, start, end)
    collected = collected_cents(g.org.id, start, end)
    outstanding, overdue = outstanding_cents(g.org.id)
    profit = estimated_profit_this_month(g.org.id, today)

    jobs_today = _jobs_between(today, today)
    jobs_week = _jobs_between(week_start, week_end)
    awaiting = Job.query.filter_by(organization_id=g.org.id).filter(
        Job.status.in_(("unscheduled", "scheduled", "in_progress"))
    ).order_by(Job.scheduled_start.is_(None), Job.scheduled_start).limit(6).all()
    recent_done = (
        Job.query.filter_by(organization_id=g.org.id, status="completed")
        .order_by(Job.completed_at.desc())
        .limit(5)
        .all()
    )
    invoice_counts = {
        status: Invoice.query.filter_by(organization_id=g.org.id, status=status).count()
        for status in ("draft", "sent", "viewed", "partial", "paid", "overdue")
    }
    from sere.models import Activity

    activity = (
        Activity.query.filter_by(organization_id=g.org.id)
        .order_by(Activity.created_at.desc())
        .limit(10)
        .all()
    )
    return render(
        "sere/overview.html",
        revenue=revenue,
        collected=collected,
        outstanding=outstanding,
        overdue=overdue,
        profit=profit,
        jobs_today=jobs_today,
        jobs_week=jobs_week,
        awaiting=awaiting,
        recent_done=recent_done,
        invoice_counts=invoice_counts,
        activity=activity,
        month_label=today.strftime("%B"),
    )


@bp.get("/customers")
@login_required
def customers():
    q = (request.args.get("q") or "").strip()
    show = request.args.get("show", "active")
    query = Customer.query.filter_by(organization_id=g.org.id)
    if show == "archived":
        query = query.filter(Customer.archived_at.is_not(None))
    else:
        query = query.filter(Customer.archived_at.is_(None))
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Customer.name.ilike(like),
                Customer.company_name.ilike(like),
                Customer.email.ilike(like),
                Customer.phone.ilike(like),
            )
        )
    rows = query.order_by(Customer.name).all()
    cards = [
        {
            "customer": c,
            "revenue": customer_lifetime_cents(g.org.id, c.id),
            "balance": customer_balance_cents(g.org.id, c.id),
        }
        for c in rows
    ]
    return render("sere/customers/list.html", cards=cards, q=q, show=show)


@bp.route("/customers/new", methods=["GET", "POST"])
@login_required
def customer_new():
    if request.method == "POST":
        customer = Customer(organization_id=g.org.id)
        _fill_customer(customer)
        if not customer.name:
            flash("A customer name is required.", "error")
            return render("sere/customers/form.html", customer=customer, mode="new"), 400
        db.session.add(customer)
        db.session.flush()
        log_activity(
            g.org.id,
            "customer_created",
            f"New customer — {customer.display_name}",
            link=f"/customers/{customer.id}",
        )
        db.session.commit()
        flash("Customer added.", "success")
        nxt = request.form.get("next")
        if nxt == "job":
            return redirect(url_for("sere.job_new", customer_id=customer.id))
        return redirect(url_for("sere.customer_detail", customer_id=customer.id))
    customer = Customer(organization_id=g.org.id, customer_since=date.today())
    return render("sere/customers/form.html", customer=customer, mode="new")


@bp.get("/customers/<int:customer_id>")
@login_required
def customer_detail(customer_id: int):
    customer = org_get(Customer, customer_id)
    notes = (
        Note.query.filter_by(organization_id=g.org.id, customer_id=customer.id)
        .order_by(Note.created_at.desc())
        .all()
    )
    files = (
        Attachment.query.filter_by(organization_id=g.org.id, customer_id=customer.id)
        .order_by(Attachment.created_at.desc())
        .all()
    )
    return render(
        "sere/customers/detail.html",
        customer=customer,
        jobs=sorted(customer.jobs, key=lambda j: j.created_at, reverse=True),
        invoices=sorted(customer.invoices, key=lambda i: i.issue_date, reverse=True),
        payments=[p for p in customer.payments if p.voided_at is None],
        notes=notes,
        files=files,
        lifetime=customer_lifetime_cents(g.org.id, customer.id),
        balance=customer_balance_cents(g.org.id, customer.id),
        amount_paid=amount_paid_cents,
        balance_of=balance_cents,
    )


@bp.route("/customers/<int:customer_id>/edit", methods=["GET", "POST"])
@login_required
def customer_edit(customer_id: int):
    customer = org_get(Customer, customer_id)
    if request.method == "POST":
        _fill_customer(customer)
        if not customer.name:
            flash("A customer name is required.", "error")
            return render("sere/customers/form.html", customer=customer, mode="edit"), 400
        db.session.commit()
        flash("Customer updated.", "success")
        return redirect(url_for("sere.customer_detail", customer_id=customer.id))
    return render("sere/customers/form.html", customer=customer, mode="edit")


@bp.post("/customers/<int:customer_id>/archive")
@login_required
def customer_archive(customer_id: int):
    customer = org_get(Customer, customer_id)
    if customer.archived_at:
        customer.archived_at = None
        flash("Customer restored.", "success")
    else:
        customer.archived_at = utcnow()
        flash("Customer archived. Past invoices stay in reports.", "success")
    db.session.commit()
    return redirect(url_for("sere.customer_detail", customer_id=customer.id))


@bp.post("/customers/<int:customer_id>/notes")
@login_required
def customer_note(customer_id: int):
    customer = org_get(Customer, customer_id)
    body = field("body")
    if body:
        db.session.add(
            Note(
                organization_id=g.org.id,
                customer_id=customer.id,
                body=body,
                created_by_id=g.user.id,
            )
        )
        db.session.commit()
    return redirect(url_for("sere.customer_detail", customer_id=customer.id))


@bp.post("/customers/<int:customer_id>/files")
@login_required
def customer_file(customer_id: int):
    customer = org_get(Customer, customer_id)
    stored = _save_upload(request.files.get("file"))
    if not stored:
        flash("Choose a photo or document to upload.", "error")
    else:
        db.session.add(
            Attachment(
                organization_id=g.org.id,
                customer_id=customer.id,
                filename=stored["filename"],
                stored_name=stored["stored_name"],
                content_type=stored["content_type"],
            )
        )
        db.session.commit()
        flash("File added.", "success")
    return redirect(url_for("sere.customer_detail", customer_id=customer.id))


@bp.get("/jobs")
@login_required
def jobs():
    status = request.args.get("status", "")
    q = (request.args.get("q") or "").strip()
    query = Job.query.filter_by(organization_id=g.org.id)
    if status in JOB_STATUSES:
        query = query.filter_by(status=status)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Job.title.ilike(like), Job.technician_name.ilike(like)))
    rows = query.order_by(Job.scheduled_start.is_(None), Job.scheduled_start.desc()).all()
    return render("sere/jobs/list.html", jobs=rows, status=status, q=q)


@bp.route("/jobs/new", methods=["GET", "POST"])
@login_required
def job_new():
    customers = _active_customers()
    job = Job(organization_id=g.org.id, status="unscheduled")
    preselect = request.args.get("customer_id", type=int)
    if preselect:
        job.customer_id = preselect
        customer = Customer.query.filter_by(id=preselect, organization_id=g.org.id).first()
        if customer:
            copy_service_address(job, customer)
    start = request.args.get("start")
    if start:
        job.scheduled_start = datetime.fromisoformat(start)
        job.status = "scheduled"
    if request.method == "POST":
        _fill_job(job)
        if not job.customer_id or not job.title:
            flash("Customer and job title are required.", "error")
            return render(
                "sere/jobs/form.html", job=job, customers=customers, mode="new"
            ), 400
        if job.scheduled_start and job.status == "unscheduled":
            job.status = "scheduled"
        db.session.add(job)
        db.session.flush()
        log_activity(
            g.org.id,
            "job_created",
            f"New job created for {job.customer.display_name}",
            job.estimated_revenue_cents,
            f"/jobs/{job.id}",
        )
        db.session.commit()
        flash("Job created.", "success")
        return redirect(url_for("sere.job_detail", job_id=job.id))
    return render("sere/jobs/form.html", job=job, customers=customers, mode="new")


@bp.get("/jobs/<int:job_id>")
@login_required
def job_detail(job_id: int):
    job = org_get(Job, job_id)
    notes = (
        Note.query.filter_by(organization_id=g.org.id, job_id=job.id)
        .order_by(Note.created_at.desc())
        .all()
    )
    files = (
        Attachment.query.filter_by(organization_id=g.org.id, job_id=job.id)
        .order_by(Attachment.created_at.desc())
        .all()
    )
    return render(
        "sere/jobs/detail.html",
        job=job,
        cost_total=actual_cost_cents(job),
        revenue=job_revenue_cents(job),
        profit=job_profit_cents(job),
        notes=notes,
        files=files,
        categories=COST_CATEGORIES,
        invoices=job.invoices,
        amount_paid=amount_paid_cents,
        balance_of=balance_cents,
    )


@bp.route("/jobs/<int:job_id>/edit", methods=["GET", "POST"])
@login_required
def job_edit(job_id: int):
    job = org_get(Job, job_id)
    customers = _active_customers()
    if request.method == "POST":
        _fill_job(job)
        if not job.title:
            flash("A job title is required.", "error")
            return render(
                "sere/jobs/form.html", job=job, customers=customers, mode="edit"
            ), 400
        db.session.commit()
        flash("Job updated.", "success")
        return redirect(url_for("sere.job_detail", job_id=job.id))
    return render("sere/jobs/form.html", job=job, customers=customers, mode="edit")


@bp.post("/jobs/<int:job_id>/status")
@login_required
def job_status(job_id: int):
    job = org_get(Job, job_id)
    status = field("status")
    if status not in JOB_STATUSES:
        abort(400)
    if status == "completed":
        complete_job(job)
    elif status == "cancelled":
        job.status = "cancelled"
        job.cancelled_at = utcnow()
    else:
        job.status = status
        if status == "scheduled" and not job.scheduled_start:
            flash("Set a date before marking the job scheduled.", "error")
            return redirect(url_for("sere.job_detail", job_id=job.id))
    db.session.commit()
    flash("Job updated.", "success")
    return redirect(url_for("sere.job_detail", job_id=job.id))


@bp.post("/jobs/<int:job_id>/costs")
@login_required
def job_cost(job_id: int):
    job = org_get(Job, job_id)
    amount = cents_field("amount")
    if amount <= 0:
        flash("Enter a cost greater than zero.", "error")
        return redirect(url_for("sere.job_detail", job_id=job.id))
    db.session.add(
        JobCost(
            organization_id=g.org.id,
            job_id=job.id,
            category=field("category") or "miscellaneous",
            description=field("description") or field("category") or "Cost",
            amount_cents=amount,
        )
    )
    db.session.commit()
    return redirect(url_for("sere.job_detail", job_id=job.id))


@bp.post("/jobs/<int:job_id>/notes")
@login_required
def job_note(job_id: int):
    job = org_get(Job, job_id)
    body = field("body")
    if body:
        db.session.add(
            Note(
                organization_id=g.org.id,
                customer_id=job.customer_id,
                job_id=job.id,
                body=body,
                created_by_id=g.user.id,
            )
        )
        db.session.commit()
    return redirect(url_for("sere.job_detail", job_id=job.id))


@bp.post("/jobs/<int:job_id>/files")
@login_required
def job_file(job_id: int):
    job = org_get(Job, job_id)
    stored = _save_upload(request.files.get("file"))
    if stored:
        db.session.add(
            Attachment(
                organization_id=g.org.id,
                customer_id=job.customer_id,
                job_id=job.id,
                filename=stored["filename"],
                stored_name=stored["stored_name"],
                content_type=stored["content_type"],
            )
        )
        db.session.commit()
        flash("Photo added.", "success")
    else:
        flash("Choose a file to upload.", "error")
    return redirect(url_for("sere.job_detail", job_id=job.id))


@bp.post("/jobs/<int:job_id>/invoice")
@login_required
def job_invoice(job_id: int):
    job = org_get(Job, job_id)
    invoice = invoice_from_job(job, g.org)
    db.session.commit()
    flash("Invoice drafted from this job.", "success")
    return redirect(url_for("sere.invoice_detail", invoice_id=invoice.id))


@bp.post("/jobs/<int:job_id>/reschedule")
@login_required
def job_reschedule(job_id: int):
    job = org_get(Job, job_id)
    start = datetime_field("scheduled_start")
    if not start:
        flash("Pick a date and time.", "error")
        return redirect(url_for("sere.job_detail", job_id=job.id))
    job.scheduled_start = start
    if job.status == "unscheduled":
        job.status = "scheduled"
    db.session.commit()
    return redirect(request.referrer or url_for("sere.calendar"))


@bp.get("/invoices")
@login_required
def invoices():
    refresh_open_invoices(g.org.id)
    db.session.commit()
    status = request.args.get("status", "")
    q = (request.args.get("q") or "").strip()
    query = Invoice.query.filter_by(organization_id=g.org.id)
    if status in INVOICE_STATUSES:
        query = query.filter_by(status=status)
    if q:
        like = f"%{q}%"
        query = query.filter(Invoice.number.ilike(like))
    rows = query.order_by(Invoice.issue_date.desc(), Invoice.id.desc()).all()
    return render(
        "sere/invoices/list.html",
        invoices=rows,
        status=status,
        q=q,
        amount_paid=amount_paid_cents,
        balance_of=balance_cents,
    )


@bp.route("/invoices/new", methods=["GET", "POST"])
@login_required
def invoice_new():
    customers = _active_customers()
    services = _services()
    invoice = Invoice(
        organization_id=g.org.id,
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=g.org.payment_terms_days or 14),
        tax_bps=g.org.default_tax_bps or 0,
        notes=g.org.default_invoice_notes or "",
        status="draft",
    )
    pre_customer = request.args.get("customer_id", type=int)
    pre_job = request.args.get("job_id", type=int)
    if pre_customer:
        invoice.customer_id = pre_customer
    if pre_job:
        job = Job.query.filter_by(id=pre_job, organization_id=g.org.id).first()
        if job:
            invoice.job_id = job.id
            invoice.customer_id = job.customer_id
    if request.method == "POST":
        try:
            invoice = _save_invoice(invoice, is_new=True)
        except ValueError as exc:
            flash(str(exc), "error")
            return render(
                "sere/invoices/form.html",
                invoice=invoice,
                customers=customers,
                jobs=_jobs_for_customer(invoice.customer_id),
                services=services,
                mode="new",
            ), 400
        db.session.commit()
        flash("Invoice saved.", "success")
        return redirect(url_for("sere.invoice_detail", invoice_id=invoice.id))
    return render(
        "sere/invoices/form.html",
        invoice=invoice,
        customers=customers,
        jobs=_jobs_for_customer(invoice.customer_id),
        services=services,
        mode="new",
    )


@bp.get("/invoices/<int:invoice_id>")
@login_required
def invoice_detail(invoice_id: int):
    invoice = org_get(Invoice, invoice_id)
    refresh_invoice(invoice)
    db.session.commit()
    return render(
        "sere/invoices/detail.html",
        invoice=invoice,
        paid=amount_paid_cents(invoice),
        balance=balance_cents(invoice),
        public_url=_public_invoice_url(invoice),
        email_ready=smtp_configured(),
        stripe_ready=bool(current_app.config.get("STRIPE_SECRET_KEY")),
    )


@bp.route("/invoices/<int:invoice_id>/edit", methods=["GET", "POST"])
@login_required
def invoice_edit(invoice_id: int):
    invoice = org_get(Invoice, invoice_id)
    if invoice.status in ("paid", "void"):
        flash("Paid or void invoices cannot be edited.", "error")
        return redirect(url_for("sere.invoice_detail", invoice_id=invoice.id))
    if request.method == "POST":
        try:
            _save_invoice(invoice, is_new=False)
        except ValueError as exc:
            flash(str(exc), "error")
            return render(
                "sere/invoices/form.html",
                invoice=invoice,
                customers=_active_customers(),
                jobs=_jobs_for_customer(invoice.customer_id),
                services=_services(),
                mode="edit",
            ), 400
        db.session.commit()
        flash("Invoice updated.", "success")
        return redirect(url_for("sere.invoice_detail", invoice_id=invoice.id))
    return render(
        "sere/invoices/form.html",
        invoice=invoice,
        customers=_active_customers(),
        jobs=_jobs_for_customer(invoice.customer_id),
        services=_services(),
        mode="edit",
    )


@bp.post("/invoices/<int:invoice_id>/send")
@login_required
def invoice_send(invoice_id: int):
    invoice = org_get(Invoice, invoice_id)
    mark_sent(invoice)
    db.session.commit()
    public = _public_invoice_url(invoice)
    result = send_email(
        invoice.customer.email,
        f"{invoice.number} from {g.org.name}",
        f"{g.org.name} sent you invoice {invoice.number} for "
        f"{format_money(invoice.total_cents)}.\n\nView and pay: {public}",
    )
    if result["ok"]:
        flash("Invoice emailed to the customer.", "success")
    else:
        flash(
            f"Marked as sent. {result['reason']} Share this link: {public}",
            "error",
        )
    return redirect(url_for("sere.invoice_detail", invoice_id=invoice.id))


@bp.post("/invoices/<int:invoice_id>/void")
@login_required
def invoice_void(invoice_id: int):
    invoice = org_get(Invoice, invoice_id)
    try:
        void_invoice(invoice)
        db.session.commit()
        flash("Invoice voided.", "success")
    except ValueError as exc:
        flash(str(exc), "error")
    return redirect(url_for("sere.invoice_detail", invoice_id=invoice.id))


@bp.get("/invoices/<int:invoice_id>.pdf")
@login_required
def invoice_pdf_route(invoice_id: int):
    invoice = org_get(Invoice, invoice_id)
    data = invoice_pdf(invoice, g.org)
    return send_file(
        __import__("io").BytesIO(data),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{invoice.number}.pdf",
    )


@bp.get("/invoices/<int:invoice_id>/preview")
@login_required
def invoice_preview(invoice_id: int):
    invoice = org_get(Invoice, invoice_id)
    return render(
        "sere/invoices/preview.html",
        invoice=invoice,
        org=g.org,
        paid=amount_paid_cents(invoice),
        balance=balance_cents(invoice),
        public=False,
    )


@bp.get("/payments")
@login_required
def payments():
    q = (request.args.get("q") or "").strip()
    query = Payment.query.filter_by(organization_id=g.org.id, voided_at=None)
    if q:
        like = f"%{q}%"
        query = query.join(Customer).outerjoin(Invoice).filter(
            or_(
                Customer.name.ilike(like),
                Customer.company_name.ilike(like),
                Invoice.number.ilike(like),
                Payment.reference.ilike(like),
            )
        )
    rows = query.order_by(Payment.paid_on.desc(), Payment.id.desc()).all()
    return render("sere/payments/list.html", payments=rows, q=q)


@bp.route("/payments/new", methods=["GET", "POST"])
@login_required
def payment_new():
    invoice = None
    invoice_id = request.args.get("invoice_id", type=int) or int_field("invoice_id")
    if invoice_id:
        invoice = org_get(Invoice, invoice_id)
    if request.method == "POST":
        try:
            payment = create_payment(
                organization_id=g.org.id,
                customer_id=int_field("customer_id") or (invoice.customer_id if invoice else 0),
                invoice_id=invoice.id if invoice else (int_field("invoice_id") or None),
                amount_cents=cents_field("amount"),
                paid_on=date_field("paid_on", date.today()) or date.today(),
                method=field("method") or "card",
                reference=field("reference"),
                notes=field("notes"),
            )
            db.session.commit()
            flash("Payment recorded.", "success")
            if payment.invoice_id:
                return redirect(url_for("sere.invoice_detail", invoice_id=payment.invoice_id))
            return redirect(url_for("sere.payment_detail", payment_id=payment.id))
        except ValueError as exc:
            flash(str(exc), "error")
    open_invoices = Invoice.query.filter(
        Invoice.organization_id == g.org.id,
        Invoice.status.in_(("sent", "viewed", "partial", "overdue", "draft")),
    ).order_by(Invoice.due_date).all()
    return render(
        "sere/payments/form.html",
        invoice=invoice,
        customers=_active_customers(),
        open_invoices=open_invoices,
        methods=PAYMENT_METHODS,
        default_amount=balance_cents(invoice) if invoice else 0,
    )


@bp.get("/payments/<int:payment_id>")
@login_required
def payment_detail(payment_id: int):
    payment = org_get(Payment, payment_id)
    return render("sere/payments/detail.html", payment=payment)


@bp.post("/payments/<int:payment_id>/void")
@login_required
def payment_void(payment_id: int):
    payment = org_get(Payment, payment_id)
    void_payment(payment)
    db.session.commit()
    flash("Payment voided. Invoice balances were recalculated.", "success")
    return redirect(url_for("sere.payments"))


@bp.get("/calendar")
@login_required
def calendar():
    view = request.args.get("view", "week")
    anchor = date_field("date") if request.args.get("date") else date.today()
    if request.args.get("date"):
        try:
            anchor = date.fromisoformat(request.args["date"])
        except ValueError:
            anchor = date.today()
    if view == "day":
        start = end = anchor
    elif view == "month":
        start, end = month_bounds(anchor)
        start = start - timedelta(days=start.weekday())
        end = end + timedelta(days=6 - end.weekday())
    else:
        view = "week"
        start, end = week_bounds(anchor)
    jobs = _jobs_between(start, end)
    by_day: dict[date, list[Job]] = {}
    cursor = start
    while cursor <= end:
        by_day[cursor] = []
        cursor += timedelta(days=1)
    for job in jobs:
        if job.scheduled_start:
            by_day.setdefault(job.scheduled_start.date(), []).append(job)
    return render(
        "sere/calendar.html",
        view=view,
        anchor=anchor,
        start=start,
        end=end,
        by_day=by_day,
        today=date.today(),
        unscheduled=Job.query.filter_by(
            organization_id=g.org.id, status="unscheduled"
        ).order_by(Job.created_at.desc()).all(),
    )


@bp.get("/reports")
@login_required
def reports():
    refresh_open_invoices(g.org.id)
    db.session.commit()
    period = request.args.get("period", "this_month")
    today = date.today()
    if period == "custom":
        start = date_field("start") or month_bounds(today)[0]
        end = date_field("end") or today
        if request.args.get("start"):
            start = date.fromisoformat(request.args["start"])
        if request.args.get("end"):
            end = date.fromisoformat(request.args["end"])
    else:
        start, end = period_bounds(period, today)
    money_in = collected_cents(g.org.id, start, end)
    invoiced = invoiced_revenue_cents(g.org.id, start, end)
    outstanding, overdue = outstanding_cents(g.org.id)
    expected = expected_cash(g.org.id)
    jobs = (
        Job.query.filter_by(organization_id=g.org.id, status="completed")
        .order_by(Job.completed_at.desc())
        .all()
    )
    job_rows = []
    for job in jobs:
        stamp = job.completed_at.date() if job.completed_at else None
        if stamp and (stamp < start or stamp > end):
            continue
        job_rows.append(
            {
                "job": job,
                "revenue": job_revenue_cents(job),
                "cost": actual_cost_cents(job),
                "profit": job_profit_cents(job),
            }
        )
    avg_value = (
        sum(r["revenue"] for r in job_rows) // len(job_rows) if job_rows else 0
    )
    avg_margin = None
    if job_rows and sum(r["revenue"] for r in job_rows):
        from sere.money import margin_bps

        avg_margin = margin_bps(
            sum(r["revenue"] for r in job_rows), sum(r["cost"] for r in job_rows)
        )
    monthly_profit = sum(r["profit"] for r in job_rows)
    best = sorted(job_rows, key=lambda r: r["profit"], reverse=True)[:5]
    worst = sorted(job_rows, key=lambda r: r["profit"])[:5]
    return render(
        "sere/reports.html",
        period=period,
        start=start,
        end=end,
        money_in=money_in,
        invoiced=invoiced,
        outstanding=outstanding,
        overdue=overdue,
        expected=expected,
        job_rows=job_rows,
        avg_value=avg_value,
        avg_margin=avg_margin,
        monthly_profit=monthly_profit,
        best=best,
        worst=worst,
    )


@bp.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    tab = request.args.get("tab", "company")
    if request.method == "POST":
        section = field("section") or tab
        if section == "company":
            g.org.name = field("name") or g.org.name
            g.org.phone = field("phone")
            g.org.email = field("email")
            g.org.address_line1 = field("address_line1")
            g.org.address_line2 = field("address_line2")
            g.org.city = field("city")
            g.org.state = field("state")
            g.org.postal_code = field("postal_code")
            g.org.tax_id = field("tax_id")
            stored = _save_upload(request.files.get("logo"), images_only=True)
            if stored:
                g.org.logo_path = stored["stored_name"]
        elif section == "invoices":
            g.org.invoice_prefix = field("invoice_prefix") or "INV-"
            g.org.payment_terms_days = int_field("payment_terms_days", 14)
            g.org.default_invoice_notes = field("default_invoice_notes")
            g.org.default_tax_bps = int(round(float(field("default_tax") or "0") * 100))
        elif section == "account":
            g.user.name = field("user_name") or g.user.name
            email = field("user_email").lower()
            if email and email != g.user.email:
                if User.query.filter(func.lower(User.email) == email, User.id != g.user.id).first():
                    flash("That email is already in use.", "error")
                    return redirect(url_for("sere.settings", tab="account"))
                g.user.email = email
            current = field("current_password")
            new_password = field("new_password")
            if new_password:
                if not verify_password(g.user, current):
                    flash("Current password is incorrect.", "error")
                    return redirect(url_for("sere.settings", tab="account"))
                if len(new_password) < 8:
                    flash("Use a password with at least 8 characters.", "error")
                    return redirect(url_for("sere.settings", tab="account"))
                g.user.password_hash = hash_password(new_password)
        elif section == "service":
            name = field("service_name")
            if name:
                db.session.add(
                    ServiceItem(
                        organization_id=g.org.id,
                        name=name,
                        description=field("service_description"),
                        unit_price_cents=cents_field("service_price"),
                    )
                )
        db.session.commit()
        flash("Settings saved.", "success")
        return redirect(url_for("sere.settings", tab=section if section != "service" else "invoices"))
    return render(
        "sere/settings.html",
        tab=tab,
        services=_services(),
        smtp_ready=smtp_configured(),
        stripe_ready=bool(current_app.config.get("STRIPE_SECRET_KEY")),
    )


@bp.get("/notifications")
@login_required
def notifications():
    rows = (
        Notification.query.filter_by(organization_id=g.org.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return render("sere/notifications.html", notifications=rows)


@bp.post("/notifications/read")
@login_required
def notifications_read():
    Notification.query.filter_by(organization_id=g.org.id, read_at=None).update(
        {"read_at": utcnow()}
    )
    db.session.commit()
    return redirect(request.referrer or url_for("sere.notifications"))


@bp.get("/search")
@login_required
def search():
    q = (request.args.get("q") or "").strip()
    results = search_org(g.org.id, q)
    if request.headers.get("X-Requested-With") == "fetch" or request.args.get("json"):
        return jsonify(
            {
                "customers": [
                    {
                        "id": c.id,
                        "label": c.display_name,
                        "meta": c.phone or c.email,
                        "href": url_for("sere.customer_detail", customer_id=c.id),
                    }
                    for c in results["customers"]
                ],
                "jobs": [
                    {
                        "id": j.id,
                        "label": j.title,
                        "meta": j.customer.display_name,
                        "href": url_for("sere.job_detail", job_id=j.id),
                    }
                    for j in results["jobs"]
                ],
                "invoices": [
                    {
                        "id": i.id,
                        "label": i.number,
                        "meta": i.customer.display_name,
                        "href": url_for("sere.invoice_detail", invoice_id=i.id),
                    }
                    for i in results["invoices"]
                ],
            }
        )
    return render("sere/search.html", q=q, results=results)


@bp.get("/files/<path:stored_name>")
@login_required
def files(stored_name: str):
    folder = Path(current_app.config["UPLOAD_FOLDER"]) / str(g.org.id)
    return send_from_directory(folder, stored_name)


@bp.get("/p/inv/<token>")
def public_invoice(token: str):
    invoice = Invoice.query.filter_by(public_token=token).first_or_404()
    org = db.session.get(Organization, invoice.organization_id)
    if invoice.status not in ("void", "draft", "paid"):
        mark_viewed(invoice)
        db.session.commit()
    return render(
        "sere/invoices/preview.html",
        invoice=invoice,
        org=org,
        paid=amount_paid_cents(invoice),
        balance=balance_cents(invoice),
        public=True,
        stripe_ready=bool(current_app.config.get("STRIPE_SECRET_KEY")),
    )


@bp.get("/p/inv/<token>.pdf")
def public_invoice_pdf(token: str):
    invoice = Invoice.query.filter_by(public_token=token).first_or_404()
    org = db.session.get(Organization, invoice.organization_id)
    data = invoice_pdf(invoice, org)
    return send_file(
        __import__("io").BytesIO(data),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{invoice.number}.pdf",
    )


@bp.get("/api/jobs-for-customer/<int:customer_id>")
@login_required
def jobs_for_customer(customer_id: int):
    org_get(Customer, customer_id)
    jobs = _jobs_for_customer(customer_id)
    return jsonify(
        [{"id": j.id, "title": j.title, "status": j.status} for j in jobs]
    )


def _jobs_between(start: date, end: date) -> list[Job]:
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())
    return (
        Job.query.filter(
            Job.organization_id == g.org.id,
            Job.scheduled_start.is_not(None),
            Job.scheduled_start >= start_dt,
            Job.scheduled_start <= end_dt,
            Job.status != "cancelled",
        )
        .order_by(Job.scheduled_start)
        .all()
    )


def _active_customers() -> list[Customer]:
    return (
        Customer.query.filter_by(organization_id=g.org.id, archived_at=None)
        .order_by(Customer.name)
        .all()
    )


def _services() -> list[ServiceItem]:
    return (
        ServiceItem.query.filter_by(organization_id=g.org.id, archived_at=None)
        .order_by(ServiceItem.name)
        .all()
    )


def _jobs_for_customer(customer_id: int | None) -> list[Job]:
    if not customer_id:
        return []
    return (
        Job.query.filter_by(organization_id=g.org.id, customer_id=customer_id)
        .order_by(Job.created_at.desc())
        .all()
    )


def _fill_customer(customer: Customer) -> None:
    customer.name = field("name")
    customer.company_name = field("company_name")
    customer.email = field("email")
    customer.phone = field("phone")
    customer.billing_line1 = field("billing_line1")
    customer.billing_line2 = field("billing_line2")
    customer.billing_city = field("billing_city")
    customer.billing_state = field("billing_state")
    customer.billing_postal = field("billing_postal")
    if field("same_as_billing"):
        customer.service_line1 = customer.billing_line1
        customer.service_line2 = customer.billing_line2
        customer.service_city = customer.billing_city
        customer.service_state = customer.billing_state
        customer.service_postal = customer.billing_postal
    else:
        customer.service_line1 = field("service_line1")
        customer.service_line2 = field("service_line2")
        customer.service_city = field("service_city")
        customer.service_state = field("service_state")
        customer.service_postal = field("service_postal")
    customer.notes = field("notes")
    since = date_field("customer_since")
    if since:
        customer.customer_since = since


def _fill_job(job: Job) -> None:
    job.customer_id = int_field("customer_id")
    job.title = field("title")
    job.description = field("description")
    job.service_line1 = field("service_line1")
    job.service_line2 = field("service_line2")
    job.service_city = field("service_city")
    job.service_state = field("service_state")
    job.service_postal = field("service_postal")
    job.scheduled_start = datetime_field("scheduled_start")
    job.scheduled_end = datetime_field("scheduled_end")
    status = field("status")
    if status in JOB_STATUSES:
        job.status = status
    job.technician_name = field("technician_name")
    job.estimated_revenue_cents = cents_field("estimated_revenue")
    job.actual_revenue_cents = cents_field("actual_revenue")
    job.estimated_cost_cents = cents_field("estimated_cost")
    job.notes = field("notes")


def _save_invoice(invoice: Invoice, *, is_new: bool) -> Invoice:
    customer_id = int_field("customer_id")
    if not customer_id:
        raise ValueError("Choose a customer.")
    customer = Customer.query.filter_by(
        id=customer_id, organization_id=g.org.id
    ).first()
    if not customer:
        raise ValueError("Customer not found.")
    invoice.customer_id = customer.id
    job_id = int_field("job_id")
    invoice.job_id = job_id or None
    if job_id:
        job = Job.query.filter_by(id=job_id, organization_id=g.org.id).first()
        if not job:
            raise ValueError("Job not found.")
    invoice.issue_date = date_field("issue_date", date.today()) or date.today()
    invoice.due_date = date_field("due_date") or invoice.issue_date + timedelta(
        days=g.org.payment_terms_days or 14
    )
    invoice.notes = field("notes")
    invoice.discount_cents = cents_field("discount")
    tax_raw = field("tax_rate")
    invoice.tax_bps = int(round(float(tax_raw or "0") * 100)) if tax_raw else g.org.default_tax_bps
    descriptions = request.form.getlist("line_description")
    quantities = request.form.getlist("line_quantity")
    prices = request.form.getlist("line_price")
    rows = []
    for desc, qty, price in zip(descriptions, quantities, prices):
        if not (desc or "").strip():
            continue
        rows.append(
            {
                "description": desc,
                "quantity": qty or "1",
                "unit_price_cents": dollars_to_cents(price or "0"),
            }
        )
    if not rows:
        raise ValueError("Add at least one line item.")
    if is_new:
        invoice.number = allocate_number(g.org)
        invoice.organization_id = g.org.id
        db.session.add(invoice)
        db.session.flush()
        add_event(invoice, "created", f"{invoice.number} created")
        log_activity(
            g.org.id,
            "invoice_created",
            f"{invoice.number} created for {customer.display_name}",
            link=f"/invoices/{invoice.id}",
        )
    set_lines(invoice, rows)
    refresh_invoice(invoice)
    return invoice


def _save_upload(file_storage, *, images_only: bool = False) -> dict | None:
    if not file_storage or not file_storage.filename:
        return None
    filename = secure_filename(file_storage.filename)
    ext = Path(filename).suffix.lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".heic"}
    if images_only:
        allowed = {".png", ".jpg", ".jpeg", ".webp"}
    if ext not in allowed:
        raise ValueError("That file type is not allowed.")
    stored = f"{uuid.uuid4().hex}{ext}"
    folder = Path(current_app.config["UPLOAD_FOLDER"]) / str(g.org.id)
    folder.mkdir(parents=True, exist_ok=True)
    file_storage.save(folder / stored)
    return {
        "filename": filename,
        "stored_name": stored,
        "content_type": file_storage.mimetype or "application/octet-stream",
    }


def _public_invoice_url(invoice: Invoice) -> str:
    base = current_app.config.get("PUBLIC_BASE_URL")
    path = url_for("sere.public_invoice", token=invoice.public_token)
    if base:
        return f"{base}{path}"
    return url_for("sere.public_invoice", token=invoice.public_token, _external=True)


def _unique_slug(name: str) -> str:
    import re

    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "company"
    slug = base
    n = 2
    while Organization.query.filter_by(slug=slug).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _default_services(organization_id: int) -> None:
    for name, description, price in (
        ("Diagnostic visit", "Inspection and recommendation", 12900),
        ("AC tune-up", "Seasonal clean and check", 18900),
        ("Capacitor replacement", "Parts and labor", 28500),
        ("After-hours labor", "First hour, nights and weekends", 19500),
    ):
        db.session.add(
            ServiceItem(
                organization_id=organization_id,
                name=name,
                description=description,
                unit_price_cents=price,
            )
        )

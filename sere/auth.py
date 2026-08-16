"""Session auth and organization isolation."""

from __future__ import annotations

from functools import wraps

from flask import abort, g, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from sere.extensions import db
from sere.models import Membership, Organization, User


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(user: User, password: str) -> bool:
    return check_password_hash(user.password_hash, password)


def login_user(user: User, organization: Organization | None = None) -> None:
    session["user_id"] = user.id
    if organization is None:
        membership = (
            Membership.query.filter_by(user_id=user.id)
            .order_by(Membership.id)
            .first()
        )
        organization = membership.organization if membership else None
    if organization:
        session["organization_id"] = organization.id
    session.permanent = True


def logout_user() -> None:
    session.clear()


def current_user() -> User | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.session.get(User, user_id)


def current_org() -> Organization | None:
    org_id = session.get("organization_id")
    user = g.get("user")
    if not user or not org_id:
        return None
    membership = Membership.query.filter_by(
        user_id=user.id, organization_id=org_id
    ).first()
    return membership.organization if membership else None


def load_request_context() -> None:
    g.user = current_user()
    g.org = current_org() if g.user else None
    g.membership = None
    if g.user and g.org:
        g.membership = Membership.query.filter_by(
            user_id=g.user.id, organization_id=g.org.id
        ).first()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not g.user:
            return redirect(url_for("sere.login", next=request.path))
        if not g.org:
            return redirect(url_for("sere.onboarding"))
        return view(*args, **kwargs)

    return wrapped


def org_get(model, object_id: int):
    """Fetch a row that belongs to the current organization or 404."""
    if not g.org:
        abort(404)
    row = db.session.get(model, object_id)
    if not row or getattr(row, "organization_id", None) != g.org.id:
        abort(404)
    return row

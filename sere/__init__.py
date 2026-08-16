"""Sere application factory."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from flask import Flask, g, render_template

from sere.auth import load_request_context
from sere.config import ROOT, Config
from sere.extensions import db
from sere.helpers import STATUS_LABELS
from sere.money import format_margin, format_money, format_percent
from sere.views import bp as sere_bp


def create_app(config_class: type = Config, **overrides) -> Flask:
    app = Flask(
        "sere",
        static_folder=str(ROOT / "sere" / "static"),
        template_folder=str(ROOT / "sere" / "templates"),
    )
    app.config.from_object(config_class)
    if overrides:
        app.config.update(overrides)
    app.config["UPLOAD_FOLDER"].mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    _configure_jinja(app)

    @app.before_request
    def _load_user():
        load_request_context()

    @app.context_processor
    def _inject():
        return {
            "current_user": g.get("user"),
            "current_org": g.get("org"),
            "labels": STATUS_LABELS,
            "now": datetime.now(),
            "today": date.today(),
        }

    app.register_blueprint(sere_bp)

    @app.errorhandler(404)
    def _not_found(_e):
        return render_template("sere/error.html", code=404, title="Not found",
                               message="That page is not here."), 404

    @app.errorhandler(500)
    def _server_error(_e):
        return render_template("sere/error.html", code=500, title="Something broke",
                               message="Try again. If it keeps happening, check the server log."), 500

    with app.app_context():
        from sere import models  # noqa: F401

        db.create_all()
        if app.config.get("AUTO_SEED"):
            from sere.seed import seed_if_empty

            seed_if_empty()

    return app


def _configure_jinja(app: Flask) -> None:
    app.jinja_env.filters["money"] = format_money
    app.jinja_env.filters["percent"] = format_percent
    app.jinja_env.filters["margin"] = format_margin
    app.jinja_env.filters["status"] = lambda v: STATUS_LABELS.get(
        v, (v or "").replace("_", " ").title()
    )

    def pretty_date(value):
        if not value:
            return "—"
        if isinstance(value, datetime):
            return value.strftime("%b %-d, %Y")
        return value.strftime("%b %-d, %Y")

    def pretty_dt(value):
        if not value:
            return "—"
        if isinstance(value, datetime):
            return value.strftime("%b %-d · %-I:%M %p")
        return value.strftime("%b %-d, %Y")

    def iso_dt(value):
        if not value:
            return ""
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%dT%H:%M")
        return value.isoformat()

    app.jinja_env.filters["date"] = pretty_date
    app.jinja_env.filters["when"] = pretty_dt
    app.jinja_env.filters["isodt"] = iso_dt
    app.jinja_env.filters["timedelta"] = lambda d, **kw: d + timedelta(**kw) if d else d

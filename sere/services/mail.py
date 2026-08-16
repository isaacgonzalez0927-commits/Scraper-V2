"""Outbound email. Works without SMTP — callers get a clear skip reason."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

from flask import current_app


def smtp_configured() -> bool:
    return bool(current_app.config.get("SMTP_HOST"))


def send_email(to_addr: str, subject: str, text: str, html: str | None = None) -> dict:
    if not to_addr:
        return {"ok": False, "reason": "No recipient email address."}
    if not smtp_configured():
        return {
            "ok": False,
            "reason": (
                "Email is not configured. Set SERE_SMTP_HOST, SERE_SMTP_PORT, "
                "SERE_SMTP_USER, SERE_SMTP_PASSWORD, and SERE_SMTP_FROM."
            ),
        }
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = current_app.config["SMTP_FROM"]
    message["To"] = to_addr
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    try:
        host = current_app.config["SMTP_HOST"]
        port = current_app.config["SMTP_PORT"]
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            if current_app.config.get("SMTP_USE_TLS", True):
                smtp.starttls()
            user = current_app.config.get("SMTP_USER")
            password = current_app.config.get("SMTP_PASSWORD")
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
        return {"ok": True}
    except OSError as exc:
        return {"ok": False, "reason": f"Could not send email: {exc}"}

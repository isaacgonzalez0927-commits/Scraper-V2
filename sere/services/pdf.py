"""Downloadable invoice PDF."""

from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from sere.models import Invoice, Organization
from sere.money import format_money
from sere.services.invoices import amount_paid_cents, balance_cents


PURPLE = colors.HexColor("#6D28D9")
INK = colors.HexColor("#18181B")
MUTED = colors.HexColor("#71717A")
LINE = colors.HexColor("#E4E4E7")


def invoice_pdf(invoice: Invoice, org: Organization) -> bytes:
    buffer = BytesIO()
    page = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    left = 0.75 * inch
    y = height - 0.7 * inch

    page.setFillColor(PURPLE)
    page.roundRect(left, y - 6, 18, 18, 4, fill=1, stroke=0)
    page.setFillColor(colors.white)
    page.setFont("Times-Bold", 11)
    page.drawCentredString(left + 9, y - 2, "S")
    page.setFillColor(INK)
    page.setFont("Times-Bold", 18)
    page.drawString(left + 28, y - 2, org.name or "Sere")
    page.setFont("Helvetica", 9)
    page.setFillColor(MUTED)
    page.drawRightString(width - left, y + 4, "Invoice")
    page.setFillColor(INK)
    page.setFont("Helvetica-Bold", 14)
    page.drawRightString(width - left, y - 14, invoice.number)

    y -= 46
    page.setStrokeColor(LINE)
    page.setLineWidth(0.6)
    page.line(left, y, width - left, y)
    y -= 22

    page.setFont("Helvetica", 9)
    page.setFillColor(MUTED)
    page.drawString(left, y, "From")
    page.drawString(left + 250, y, "Bill to")
    y -= 14
    page.setFillColor(INK)
    page.setFont("Helvetica", 10)
    from_lines = [
        org.name,
        org.address_line1,
        " ".join(p for p in (org.city, org.state, org.postal_code) if p),
        org.email,
        org.phone,
    ]
    to_lines = [
        invoice.customer.display_name,
        invoice.customer.billing_address or invoice.customer.service_address,
        invoice.customer.email,
        invoice.customer.phone,
    ]
    for index in range(max(len(from_lines), len(to_lines))):
        if index < len(from_lines) and from_lines[index]:
            page.drawString(left, y, str(from_lines[index])[:48])
        if index < len(to_lines) and to_lines[index]:
            page.drawString(left + 250, y, str(to_lines[index])[:48])
        y -= 13

    y -= 8
    page.setFillColor(MUTED)
    page.setFont("Helvetica", 9)
    page.drawString(left, y, f"Issued {invoice.issue_date.strftime('%b %-d, %Y')}")
    page.drawString(left + 160, y, f"Due {invoice.due_date.strftime('%b %-d, %Y')}")
    page.drawString(left + 300, y, f"Status {invoice.status.replace('_', ' ').title()}")
    y -= 22

    page.setFillColor(colors.HexColor("#FAFAF9"))
    page.roundRect(left, y - 16, width - 2 * left, 24, 4, fill=1, stroke=0)
    page.setFillColor(MUTED)
    page.setFont("Helvetica-Bold", 8)
    page.drawString(left + 8, y - 8, "DESCRIPTION")
    page.drawRightString(width - left - 150, y - 8, "QTY")
    page.drawRightString(width - left - 80, y - 8, "PRICE")
    page.drawRightString(width - left - 8, y - 8, "AMOUNT")
    y -= 32

    page.setFont("Helvetica", 9)
    page.setFillColor(INK)
    for line in invoice.lines:
        page.drawString(left + 8, y, line.description[:62])
        page.drawRightString(width - left - 150, y, f"{line.quantity:g}")
        page.drawRightString(width - left - 80, y, format_money(line.unit_price_cents))
        page.drawRightString(width - left - 8, y, format_money(line.amount_cents))
        y -= 16
        if y < 140:
            page.showPage()
            y = height - 0.75 * inch

    y -= 10
    page.setStrokeColor(LINE)
    page.line(left, y, width - left, y)
    y -= 18
    totals = [
        ("Subtotal", invoice.subtotal_cents),
        ("Discount", -invoice.discount_cents if invoice.discount_cents else 0),
        (f"Tax ({invoice.tax_bps / 100:.2f}%)", invoice.tax_cents),
        ("Total", invoice.total_cents),
        ("Paid", amount_paid_cents(invoice)),
        ("Balance due", balance_cents(invoice)),
    ]
    for label, cents in totals:
        if label == "Discount" and not invoice.discount_cents:
            continue
        page.setFont("Helvetica-Bold" if label in {"Total", "Balance due"} else "Helvetica", 10)
        page.setFillColor(INK if label != "Balance due" else PURPLE)
        page.drawRightString(width - left - 90, y, label)
        page.drawRightString(width - left - 8, y, format_money(cents))
        y -= 16

    if invoice.notes:
        y -= 10
        page.setFillColor(MUTED)
        page.setFont("Helvetica", 9)
        page.drawString(left, y, "Notes")
        y -= 14
        page.setFillColor(INK)
        page.drawString(left, y, invoice.notes[:110])

    page.setFillColor(MUTED)
    page.setFont("Helvetica", 8)
    page.drawString(left, 0.55 * inch, "Prepared with Sere · sere.cash")
    page.showPage()
    page.save()
    return buffer.getvalue()

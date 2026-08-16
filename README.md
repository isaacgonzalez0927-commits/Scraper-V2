# Sere

Sere helps HVAC businesses manage jobs, invoices, payments, and cash flow in one simple place.

Primary domain: [sere.cash](https://sere.cash)

## Run locally

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open the printed URL.

Demo company (created automatically when the database is empty):

- Email: `owner@sere.cash`
- Password: `harborair`
- Company: Harbor Air (Fort Myers)

## What Sere does

- **Overview** — collected cash vs invoiced revenue, overdue balances, jobs, invoice status, recent activity
- **Customers** — contact info, jobs, invoices, payments, notes, photos, lifetime value
- **Jobs** — schedule, costs, profit, complete, draft an invoice in one click
- **Invoices** — line items, tax, discounts, preview, PDF, email, public payment link, activity timeline
- **Payments** — ledger with partial payments; an invoice is never marked paid until the balance is zero
- **Reports** — money in, outstanding, overdue, expected cash, job profitability
- **Calendar** — day / week / month of scheduled jobs
- **Search** — names, phones, emails, addresses, invoice numbers (`⌘K`)
- **Settings** — company, invoice defaults, payment-provider status, account

Every business row is scoped by organization. One company’s data cannot appear in another.

Money is stored as integer cents. Invoice paid amounts are summed from valid payments, never incremented.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `SERE_SECRET_KEY` | Production | Session signing |
| `SERE_PUBLIC_BASE_URL` | Recommended | Public invoice links |
| `SERE_DATA_DIR` | Optional | Where SQLite and uploads live (default `data/`) |
| `SERE_SMTP_HOST` + related | Optional | Email invoices and password resets |
| `STRIPE_SECRET_KEY` | Optional | Online card checkout on the public invoice |
| `SERE_AUTO_SEED` | Optional | Set `0` to skip the Harbor Air demo data |

Without SMTP, “Email invoice” still marks the invoice sent and shows the shareable link.

Without Stripe, payments are recorded by hand (card, ACH, cash, check).

## Deploy (Render)

Build `pip install -r requirements.txt`. Start:

```bash
gunicorn app:app --workers 1 --threads 8 --timeout 180
```

Add a persistent disk mounted at `data/` if you want the SQLite files to survive restarts.

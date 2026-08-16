# Sere

Sere helps HVAC businesses manage jobs, invoices, payments, and cash flow in one simple place.

Primary domain: [sere.cash](https://sere.cash)

This is a **Next.js** app. Deploy it on **Vercel**. There is no Python in this project.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo company (created automatically when the database is empty):

- Email: `owner@sere.cash`
- Password: `harborair`
- Company: Harbor Air (Fort Myers)

```bash
npm test
npm run build
```

## What Sere does

- **Overview** — collected cash vs invoiced revenue, overdue balances, jobs, invoice status, recent activity
- **Customers** — contact info, jobs, invoices, payments, notes, lifetime value
- **Jobs** — schedule, costs, profit, complete, draft an invoice in one click
- **Invoices** — line items, tax, discounts, preview / print PDF, public payment link, activity timeline
- **Payments** — ledger with partial payments; an invoice is never marked paid until the balance is zero
- **Reports** — money in, outstanding, overdue, expected cash, job profitability
- **Calendar** — day / week / month of scheduled jobs
- **Search** — names, phones, emails, addresses, invoice numbers (`⌘K`)
- **Settings** — company, invoice defaults, payment-provider status, account

Every business row is scoped by organization. One company’s data cannot appear in another.

Money is stored as integer cents. Invoice paid amounts are summed from valid payments, never incremented.

## Deploy on Vercel

1. Import this repo in Vercel. Framework preset: Next.js.
2. Create a [Turso](https://turso.tech) database (Vercel’s filesystem is ephemeral, so local SQLite will not persist).
3. Set environment variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `SERE_SECRET_KEY` | Production | Session signing |
| `TURSO_DATABASE_URL` | Production | libSQL / Turso URL |
| `TURSO_AUTH_TOKEN` | Production | Turso auth token |
| `SERE_PUBLIC_BASE_URL` | Recommended | Public invoice links (`https://sere.cash`) |
| `SERE_SMTP_HOST` + related | Optional | Email invoices and password resets |
| `STRIPE_SECRET_KEY` | Optional | Online card checkout on the public invoice |
| `SERE_AUTO_SEED` | Optional | Set `0` to skip the Harbor Air demo data |

Without SMTP, “Mark sent” still marks the invoice sent and shows the shareable link.

Without Stripe, payments are recorded by hand (card, ACH, cash, check).

Point `sere.cash` at the Vercel project in the Vercel domain settings. No Render, no Python, no gunicorn.

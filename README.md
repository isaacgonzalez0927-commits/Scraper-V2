# Sere

Sere helps HVAC businesses manage jobs, invoices, payments, and cash flow in one simple
place.

Primary domain: [sere.cash](https://sere.cash)

This is a **Next.js** app. Deploy it on **Vercel**.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

A demo company is created automatically when the database is empty:

- Email: `owner@sere.cash`
- Password: `harborair`
- Company: Harbor Air (Fort Myers)

```bash
npm test
npm run build
```

## What Sere does

| Screen | What it is for |
| ------ | -------------- |
| Overview | Collected cash against invoiced revenue, overdue balances, today's jobs, recent activity |
| Customers | Contact details, jobs, invoices, payments, notes, lifetime value |
| Jobs | Schedule work, log costs, see profit, bill it in one click |
| Invoices | Line items, tax, discounts, printable PDF, customer payment link, timeline |
| Payments | A ledger that supports partial payments |
| Reports | Money in, outstanding, overdue, expected cash, job profitability |
| Calendar | Day, week, or month of scheduled jobs, with drag to reschedule |
| Search | Names, phones, emails, addresses, invoice numbers, on `⌘K` |
| Settings | Company details, invoice defaults, integrations, account |

Two rules the code keeps:

- Every business row is scoped to one organization. One company's data cannot appear in
  another.
- Money is stored as integer cents, and an invoice's paid amount is summed from valid
  payments rather than incremented. An invoice is paid only when the balance is zero.

## Deploy on Vercel

1. Import this repo in Vercel. Framework preset: Next.js.
2. Create a [Turso](https://turso.tech) database for real data. Without Turso, Sere
   still boots a demo database in `/tmp` so you can sign in as Harbor Air, but that file
   disappears when the serverless instance goes cold.
3. Set environment variables:

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `SERE_SECRET_KEY` | Production | Signs sessions and encrypts stored integration secrets |
| `TURSO_DATABASE_URL` | Production | libSQL / Turso URL |
| `TURSO_AUTH_TOKEN` | Production | Turso auth token |
| `SERE_PUBLIC_BASE_URL` | Recommended | Public origin for invoice links, for example `https://sere.cash` |
| `SERE_AUTO_SEED` | Optional | Set to `0` to skip the Harbor Air demo data |
| `STRIPE_SECRET_KEY` | Optional | Deployment-wide Stripe fallback for a single-shop install |
| `RESEND_API_KEY` and `SERE_EMAIL_FROM` | Optional | Deployment-wide email fallback |

Keep `SERE_SECRET_KEY` stable. Rotating it signs everyone out and makes saved Stripe and
email credentials unreadable, so each shop would have to reconnect.

## Connect your domain

Full walkthrough: [docs/DOMAIN.md](docs/DOMAIN.md).

The short version: add the domain in Vercel under Settings, then Domains; point an A
record for the apex and a CNAME for `www` at the values Vercel shows you; then set
`SERE_PUBLIC_BASE_URL` to `https://yourdomain.com` and redeploy.

## Connect Stripe and email

Full walkthrough: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

Each shop connects its own accounts from **Settings**, then **Integrations**, so money
lands in their Stripe account and email leaves from their domain. Sere stores those
credentials encrypted and never displays them again.

- **Stripe.** Paste a secret key to turn on **Pay this invoice** on the customer facing
  invoice page. Add the webhook endpoint `https://yourdomain.com/api/webhooks/stripe`
  with the event `checkout.session.completed` so a payment is recorded even if the
  customer closes the tab. Payments are keyed on the Stripe session id, so no double
  entries.
- **Email.** Paste a Resend API key and a verified from address to email invoices
  instead of copying links.

Without Stripe, payments are recorded by hand as card, bank transfer, cash, or check.
Without email, sending an invoice marks it sent and shows the shareable link.

# Sere

Sere helps local service businesses manage jobs, invoices, payments, and cash in one
place. HVAC, plumbing, electrical, landscaping, and the rest of the trades each get
language and starter services that match the shop.

Primary domain: [sere.cash](https://sere.cash)

This is a **Next.js** app. Deploy it on **Vercel**.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

A demo company, Harbor Air of Fort Myers, is created automatically when the database is
empty. Open [/demo](http://localhost:3000/demo) and you are in it, with no sign in and
nothing to type. That is also what the **Open the demo** buttons on the landing and sign
in pages do.

The demo is a real signed in session on real seeded data, so anything a visitor changes
sticks until the database is reseeded. **Leave the demo** in the sidebar signs out.

The same company still accepts a normal sign in with `owner@sere.cash` and password
`harborair`. Set `SERE_DEMO=0` to close the no sign in door, or `SERE_AUTO_SEED=0` to
skip the demo company entirely.

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
| Settings | Company details, trade type, invoice defaults, integrations, account |
| Assistant | Star in the top bar. Surfaces overdue cash and today's jobs, and can move a date or mark a job complete |

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
| `SERE_DEMO` | Optional | Set to `0` to close the no sign in demo door at `/demo` |
| `STRIPE_SECRET_KEY` | Optional | Platform key for Connect, or a single-shop fallback if Connect is off |
| `STRIPE_CONNECT_CLIENT_ID` | Optional | Enables the one-click **Connect Stripe** button (`ca_...`) |
| `STRIPE_WEBHOOK_SECRET` | Optional | Platform webhook signing secret for Connect shops |
| `RESEND_API_KEY` and `SERE_EMAIL_FROM` | Optional | Deployment-wide email fallback |

Keep `SERE_SECRET_KEY` stable. Rotating it signs everyone out and makes saved payment
and email credentials unreadable, so each shop would have to reconnect.

## Connect your domain

Full walkthrough: [docs/DOMAIN.md](docs/DOMAIN.md).

The short version: add the domain in Vercel under Settings, then Domains; point an A
record for the apex and a CNAME for `www` at the values Vercel shows you; then set
`SERE_PUBLIC_BASE_URL` to `https://yourdomain.com` and redeploy.

## Connect payments and email

Full walkthrough: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

Each shop connects its own accounts from **Settings**, then **Integrations**. **Connect
Stripe** is for the shop's books: Overview and Reports then show the live Stripe
balance, pending funds, and payouts. Credentials are stored encrypted and never
displayed again.

- **Stripe.** Paste a secret key (or one-click Connect when `STRIPE_CONNECT_CLIENT_ID`
  is set). Sere reads `/balance`, `/charges`, and `/payouts` so the owner can see
  real cash next to invoices typed in Sere. Invoice **Pay with Stripe** is optional
  leftover checkout, not the product. Webhook
  `https://yourdomain.com/api/webhooks/stripe` is only needed for that checkout path.
- **Square.** Same cash view as Stripe. Tap **Connect Square**, copy the
  production access token from [developer.squareup.com/apps](https://developer.squareup.com/apps),
  paste it. Overview then shows Square payments and payouts. Webhook
  `https://yourdomain.com/api/webhooks/square` is only for optional invoice checkout.
- **PayPal.** Optional. Invoice checkout if that shop already uses PayPal. Webhook:
  `https://yourdomain.com/api/webhooks/paypal`.
- **QuickBooks.** Optional books link. Not used for customer checkout.
- **Email.** Paste a Resend API key and a verified from address to email invoices
  instead of copying links.

Without an online processor, payments are recorded by hand as card, bank transfer, cash,
check, Zelle, or Venmo.

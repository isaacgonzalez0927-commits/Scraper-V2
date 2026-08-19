# Integrations

Every shop connects its own accounts. Sere is not a middleman: money goes from the
customer's card straight into the shop's own Stripe account, and email goes out from
the shop's own domain.

Shop owners do this from **Settings**, then **Integrations**, or from the **Connect
Stripe** button on Overview, Invoices, and Payments.

Secrets are encrypted with AES-256-GCM before they are written to the database, using a
key derived from `SERE_SECRET_KEY`. Nothing shows a saved secret back on screen. If you
rotate `SERE_SECRET_KEY`, saved secrets become unreadable and each shop has to paste
theirs again.

---

## Stripe: let customers pay an invoice by card

### What the shop owner does

1. Create a Stripe account at [stripe.com](https://stripe.com) and finish Stripe's
   business verification. Stripe pays out to the shop's bank account.
2. In Sere, select **Connect Stripe**. If one-click Connect is enabled on this
   deployment, Stripe asks them to approve Sere and they come back connected. If it is
   not enabled yet, they paste a secret key (`sk_live_...` or `sk_test_...`) on the
   same screen.
3. Invoice links then show **Pay this invoice**. Card details never touch Sere.

Cash, check, Zelle, Venmo, and bank transfers are still recorded by hand under
**Payments**. Stripe is only for the card button on the customer invoice.

### One-click Connect (Sere operator)

This is what turns the button into a real Stripe redirect instead of a paste-keys form.
It is configured once for the whole product, in Vercel:

1. Create a Stripe account for Sere itself and turn on [Stripe Connect](https://dashboard.stripe.com/connect)
   for Standard accounts.
2. Add the redirect URI:
   `https://www.sere.cash/api/integrations/stripe/callback`
   (and the `www`-less host if that is the primary domain).
3. Set environment variables and redeploy:

| Variable | Purpose |
| -------- | ------- |
| `STRIPE_CONNECT_CLIENT_ID` | Connect client id (`ca_...`) |
| `STRIPE_SECRET_KEY` | Sere's platform secret key. Used to finish OAuth, not to take the shop's money |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for Sere's platform webhook |

4. Add one webhook on the Sere platform account:
   - URL: `https://www.sere.cash/api/webhooks/stripe`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Listen to events on **Connected accounts**

Until those are set, **Connect Stripe** still works: it opens Settings so the shop can
paste their own API keys.

### Trying it without real money

Use a test key (`sk_test_...`) and Stripe's test card `4242 4242 4242 4242` with any
future expiry and any CVC. Stripe's test mode has its own webhook endpoints and its own
signing secret, so add the endpoint in test mode too if you want to exercise pasted keys.

### What the customer sees

1. The customer opens their invoice link, `/p/inv/<token>`.
2. If the shop has Stripe connected and the balance is above zero, the page shows
   **Pay this invoice**.
3. That button creates a Stripe Checkout Session for the exact remaining balance and
   sends the customer to Stripe. Card details never touch Sere.
4. Stripe returns the customer to the same invoice page with a success banner.

### How a payment gets recorded

Two independent paths, because customers close tabs:

- **The return trip.** When the customer lands back on the invoice page, Sere asks
  Stripe about that session and records the payment if Stripe says it is paid.
- **The webhook.** Stripe posts `checkout.session.completed` to
  `/api/webhooks/stripe`. Sere finds the shop from the event metadata, checks the
  signature against that shop's signing secret or the platform secret, and records
  the payment.

Whichever arrives first wins. The Stripe session id is stored as the payment reference
and is the idempotency key, so the same checkout can never be recorded twice. Sere also
caps the amount at the remaining balance, and an invoice still only turns paid when the
balance reaches zero.

### Turning it off

**Disconnect Stripe** removes the stored keys and, for Connect, disconnects the shop
in Stripe. Existing payments stay in the ledger, and invoice pages fall back to telling
the customer how to pay the shop directly.

---

## Email: send invoices instead of copying a link

Sere sends email through an HTTPS API rather than SMTP, because a serverless function
cannot hold an SMTP connection open reliably. [Resend](https://resend.com) is the
supported provider.

1. Create a Resend account, add the shop's domain, and add the DNS records Resend shows
   (SPF and DKIM). Sending from a verified domain is what keeps invoices out of spam.
2. Create an API key (`re_...`).
3. In Sere, open **Settings**, then **Integrations**, and fill in:
   - **Resend API key**
   - **From address**, for example `billing@yourshop.com`, on the domain you verified
   - **From name**, usually the shop name
   - **Reply to**, optional, usually the shop's normal inbox
4. Select **Connect email**, then **Send test** to prove it works end to end.

Once email is connected, the invoice screen's button becomes **Email invoice**. It marks
the invoice sent, emails the customer a summary with a link to pay, and adds an entry to
the invoice timeline. Without email connected the same button only marks the invoice as
sent and shows the shareable link.

---

## Running one shop and skipping the connect screen

A single-shop deployment can put the credentials in the environment instead. Any shop
without saved credentials falls back to these, **unless** `STRIPE_CONNECT_CLIENT_ID` is
set. In that case `STRIPE_SECRET_KEY` is Sere's platform key and is not used as a shop
fallback, so money cannot land in the wrong account.

| Variable | Purpose |
| -------- | ------- |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Optional, reserved for client-side use |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/webhooks/stripe` |
| `RESEND_API_KEY` | Resend API key |
| `SERE_EMAIL_FROM` | From address for outgoing email |
| `SERE_EMAIL_FROM_NAME` | From name for outgoing email |

The Integrations screen labels these as coming from the deployment environment and does
not let you disconnect them from inside the app.

---

## Adding another provider later

The store is provider agnostic: one row per shop per provider in the `integrations`
table, with credentials in a single encrypted JSON blob. To add a provider:

1. Add its config type and a reader in `lib/integrations.ts`.
2. Put the API calls in their own module, the way `lib/stripe.ts` and `lib/email.ts` do.
   Plain `fetch` keeps the dependency list short.
3. Add a card to the Integrations tab and an action that verifies the credentials before
   saving them.

No database migration is needed for a new provider.

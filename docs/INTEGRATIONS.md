# Integrations

Every shop connects its own accounts. Stripe and Square are for the shop's books:
Sere reads live payments and payouts so Overview is accurate. Email goes out from
the shop's own domain.

Shop owners paste the secret on **Overview** (or Reports, Payments, Settings) and tap
**Connect Stripe**. That is the connect action. A small **Get the key from Stripe**
link opens Stripe in a new tab so they can copy it — that link is not the button
that connects.

Secrets are encrypted with AES-256-GCM before they are written to the database, using a
key derived from `SERE_SECRET_KEY`. Nothing shows a saved secret back on screen. If you
rotate `SERE_SECRET_KEY`, saved secrets become unreadable and each shop has to paste
theirs again.

---

## Stripe: see the shop's real cash

Sere does not take the shop's money. Connecting Stripe lets the owner see what is
actually in that Stripe account: available now, pending, charges this month, and
payouts to the bank. That is the cashflow on Overview and Reports. It is more
accurate than invoices typed in by hand.

### What the shop owner does

1. Open [Stripe API keys](https://dashboard.stripe.com/apikeys) and sign in as the shop.
2. Click **Create restricted key** (not the secret key). Name it `Sere cash view`.
3. Set **Read** on: Account, Balance, Charges, Payouts. Leave everything else **None**.
4. Copy the restricted key (`rk_test_...` while trying it, `rk_live_...` for real cash).
5. Paste it in Sere under **Settings → Integrations → Stripe** and tap **Connect Stripe**.

Sere **rejects full secret keys** (`sk_live_...`). They can move money and change payout
accounts. Restricted keys can only do what you grant.

### Invoice sync

When the restricted key also has **Write** on Customers, Invoices, and Invoice Items:

- Creating or sending an invoice in Sere creates a matching Stripe Invoice for that
  customer (linked by `stripe_invoice_id`).
- Recording a payment in Sere marks the Stripe invoice paid out of band.
- Voiding in Sere voids in Stripe.
- Invoices created in the Stripe dashboard come into Sere when the shop webhook
  includes `invoice.created`, `invoice.paid`, and `invoice.voided`.

Sere stays the book. Stripe is the payment rail and a mirror — not a second set of
books fighting the first.

Overview then shows **In Stripe**. Reports shows Stripe charges next to money logged
in Sere. The two will not always match, and that is the point.

Invoice links can still offer card checkout if the restricted key also has **Checkout
Sessions → Write**. That is optional. The reason to connect Stripe is the shop's own
cash view.

Cash, check, Zelle, Venmo, and bank transfers are still recorded by hand under
**Payments**. That logged ledger is next to the live Stripe numbers so the shop
can see the gap.

### One-click Connect (optional — Sere operator)

**You do not need this.** Shops connect with a restricted key in about two minutes.

Stripe Connect requires identity verification on a platform Stripe account. If you
cannot complete that (for example, age verification), skip Connect entirely — restricted
keys work the same for cash on Overview.

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

Until those are set, shops connect with a **restricted key** as described above.
Each shop uses their own Stripe account.

### Restricted key permissions

| Stripe resource | Permission | Why |
| ---------------- | ---------- | --- |
| Account | Read | Confirm the key belongs to the shop |
| Balance | Read | Available and pending cash on Overview |
| Charges | Read | This month's card revenue |
| Payouts | Read | Recent bank transfers |
| Checkout Sessions | Write | Optional — **Pay with Stripe** on invoice links |
| Everything else | None | Sere does not need it |

### Trying it without real money

Use a test restricted key (`rk_test_...`) and Stripe's test card `4242 4242 4242 4242` with any
future expiry and any CVC. Stripe's test mode has its own webhook endpoints and its own
signing secret, so add the endpoint in test mode too if you want to exercise invoice checkout.

### Optional: invoice card checkout

Connecting Stripe for cashflow can also put **Pay with Stripe** on the public
invoice. That is extra, not the reason to connect.

1. The customer opens their invoice link, `/p/inv/<token>`.
2. If the shop has Stripe connected and the balance is above zero, the page shows
   **Pay with Stripe**. Square and PayPal, if connected, appear as secondary buttons.
3. That button creates a Stripe Checkout Session for the exact remaining balance and
   sends the customer to Stripe. Card details never touch Sere.
4. Stripe returns the customer to the same invoice page with a success banner.

### How a checkout payment gets recorded

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
in Stripe. Existing payments stay in the ledger, and invoice pages fall back to Square
or PayPal if those are connected, otherwise they tell the customer how to pay the shop
directly.

---

## Square: same cash view, same paste

Square shops tap **Connect Square**, or open
[developer.squareup.com/apps](https://developer.squareup.com/apps). Open the app
(create one if needed), **Credentials**, **Production**, copy the access token, paste
it in Sere, tap **Connect Square**. Overview then shows completed payments this month
and payouts to the bank. Square has no available-balance endpoint, so the live numbers
are take and payouts, not a wallet total.

Location ID is optional. Blank uses the first active location. Sandbox and webhook
are optional, under a disclosure. The webhook is only if you also want invoice
checkout recorded.

Webhook URL if you want it: `https://yourdomain.com/api/webhooks/square`, event
`payment.updated`.

The payment link note stores `sere:organizationId:invoiceId:customerId` so the webhook
can post the payment even if the customer closes the tab.

## PayPal: shops already on that processor

1. In the PayPal developer dashboard, create a REST app and copy the client id and
   secret.
2. In Sere, **Connect PayPal**. Check **Sandbox** when using sandbox credentials.
3. Add a webhook for `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED` at
   `https://yourdomain.com/api/webhooks/paypal`. The webhook ID is optional.

Sere creates a Capture-intent order. The return trip and the webhook both retrieve the
order, capture it if it is still only approved, and record the payment using the PayPal
order id as the idempotency key.

### QuickBooks

QuickBooks is a books link, not card checkout. Paste an access token and company
(realm) id so Sere can confirm the company name. Invoices and payments still live in
Sere.

Cash, check, Zelle, Venmo, and bank transfers are still recorded by hand under
**Payments**.

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
| `OPENAI_API_KEY` | Turns on GPT for the Sere assistant on every shop |
| `OPENAI_MODEL` | Optional. Defaults to `gpt-4o-mini` |

The Integrations screen labels these as coming from the deployment environment and does
not let you disconnect them from inside the app. For OpenAI, set a monthly budget in
[Usage limits](https://platform.openai.com/settings/organization/limits). $5 is enough
for gpt-4o-mini on a shop this size.

---

## Adding another provider later

The store is provider agnostic: one row per shop per provider in the `integrations`
table, with credentials in a single encrypted JSON blob. Stripe, email, Square, PayPal,
and QuickBooks already use that store. To add another provider:

1. Add its config type and a reader in `lib/integrations.ts`.
2. Put the API calls in their own module, the way `lib/stripe.ts` and `lib/email.ts` do.
   Plain `fetch` keeps the dependency list short.
3. Add a card to the Integrations tab and an action that verifies the credentials before
   saving them. Keep Stripe as the primary connect / pay button.

No database migration is needed for a new provider.

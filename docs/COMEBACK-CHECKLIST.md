# Sere + Nova — comeback checklist

Work through this in order. Check boxes as you go.  
**You do not send emails by hand.** Nova sends through Resend after you approve.

---

## Part A — Core Sere (production)

These make the app real on Vercel, not a demo.

- [ ] **Turso database** — create at [turso.tech](https://turso.tech), copy URL + token
- [ ] **Vercel env vars (required)**
  - [ ] `SERE_SECRET_KEY` — long random string, never rotate casually
  - [ ] `TURSO_DATABASE_URL`
  - [ ] `TURSO_AUTH_TOKEN`
  - [ ] `SERE_PUBLIC_BASE_URL=https://sere.cash`
- [ ] **Redeploy** after env vars are set
- [ ] **Smoke test** — sign up, create a customer, create a job, create an invoice

---

## Part B — Invoice email (sere.cash)

Shops get invoice links by email, not copy/paste.

- [ ] **Resend** — add domain `sere.cash`, copy DNS records to registrar
- [ ] **Wait for Verified** in Resend (5–30 min usually)
- [ ] **Vercel env vars**
  - [ ] `RESEND_API_KEY=re_...` (sere.cash key)
  - [ ] `SERE_EMAIL_FROM=billing@sere.cash` (or similar)
  - [ ] `SERE_EMAIL_FROM_NAME=Sere`
- [ ] **Redeploy**
- [ ] **Test** — email yourself an invoice from the app

---

## Part C — Payments feel polished (optional but recommended)

- [ ] **Stripe Connect** (platform, one-time) — [dashboard.stripe.com/connect](https://dashboard.stripe.com/connect)
  - [ ] `STRIPE_CONNECT_CLIENT_ID=ca_...`
  - [ ] `STRIPE_SECRET_KEY=sk_live_...` (Sere platform key)
  - [ ] Webhook → `https://sere.cash/api/webhooks/stripe`
  - [ ] `STRIPE_WEBHOOK_SECRET=whsec_...`
- [ ] **Redeploy**
- [ ] **Test** — Connect Stripe from Settings on a test shop

---

## Part D — Assistant + Nova drafting (OpenAI)

- [ ] **OpenAI** — API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- [ ] **Set $5/month budget cap** — [platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits)
- [ ] **Vercel env vars**
  - [ ] `OPENAI_API_KEY=sk-...`
  - [ ] `OPENAI_MODEL=gpt-4o-mini`
- [ ] **Redeploy**

---

## Part E — Outreach domain (the one you bought)

**Separate from sere.cash.** Cold mail comes from here; links still go to `sere.cash/demo`.

- [ ] **Resend** — add your new domain (e.g. `getsere.com`)
- [ ] **DNS** — paste SPF, DKIM, DMARC from Resend into your registrar
- [ ] **Wait for Verified**
- [ ] **Create a separate Resend API key** (do not reuse the sere.cash key)
- [ ] **Vercel env vars**
  - [ ] `OUTREACH_RESEND_API_KEY=re_...`
  - [ ] `OUTREACH_EMAIL_FROM=you@yournewdomain.com`
  - [ ] `OUTREACH_EMAIL_FROM_NAME=Isaac`
  - [ ] `OUTREACH_REPLY_TO=you@yournewdomain.com`
  - [ ] `OUTREACH_SENDER_NAME=Isaac`
  - [ ] `OUTREACH_POSTAL_ADDRESS=` your real mailing address (CAN-SPAM)
  - [ ] `OUTREACH_OPENAI_API_KEY=` (optional if `OPENAI_API_KEY` is set)
- [ ] **Redeploy** (or use locally for first tests)

---

## Part F — First outreach run (you review, Nova sends)

**Do not use Gmail.** You read drafts in the terminal; Nova sends after you approve.

### One-time setup

- [ ] Pull latest code (branch with outreach, or `main` once merged)
- [ ] `npm install`
- [ ] `npm run outreach init`

### Build a prospect list

CSV columns: `company`, `email` required. **`fact` required** — Nova will not send without it.

```csv
company,contact,email,trade,city,website,fact
Harbor Air,Elena,elena@shop.com,hvac,Fort Myers,harborair.com,"your site has no online booking form"
```

- [ ] Research 5–10 real local shops (website, one specific fact each)
- [ ] Save as `prospects.csv`
- [ ] `npm run outreach import prospects.csv`

### Review mode (first batch — you in the loop)

```bash
npm run outreach draft -- --limit 5    # Nova writes drafts
npm run outreach review                # read them
npm run outreach approve all           # or approve one at a time
npm run outreach send -- --limit 5     # Nova sends via Resend — not you
npm run outreach stats                 # see cap, breakers, reply rate
```

- [ ] Draft 5
- [ ] Read every one in `review` — reject bad ones with `discard` if needed
- [ ] Approve the good ones
- [ ] Run `send` — **Nova transmits**, you do nothing in Gmail
- [ ] Check `stats` — confirm domain warm-up cap (starts ~20/day)

### When someone replies

Replies land in your inbox (`OUTREACH_REPLY_TO`), not in the app yet.

- [ ] Tell Nova the outcome:
  ```bash
  npm run outreach outcome replied their@email.com
  npm run outreach outcome signup their@email.com   # if they signed up
  ```

---

## Part G — Autonomous mode (later, after you trust the copy)

**Only turn this on after you have reviewed a few batches and like what Nova sends.**

`npm run outreach run` auto-drafts, auto-approves, and sends with no human step.  
Use review mode (Part F) until you are comfortable.

When ready:

- [ ] `npm run outreach run -- --dry-run` — see the plan, send nothing
- [ ] `npm run outreach run` — full autonomous cycle
- [ ] **Cron** (weekdays, once or twice daily):
  ```cron
  0 14 * * 1-5  cd /path/to/sere && npm run outreach run >> /var/log/outreach.log 2>&1
  ```
  Or Vercel cron hitting a future API route when Nova console ships.

---

## Part H — Things you can skip for now

- [ ] Supabase — Sere does not use it
- [ ] Second outreach domain — one is enough to start
- [ ] Full autonomous (`run`) — use review → approve → send first
- [ ] Sere billing ($39/mo checkout) — not live yet; trials still freeze after 14 days

---

## Quick reference — two domains, two jobs

| Domain | Used for | Resend key |
|--------|----------|------------|
| **sere.cash** | Invoices, product mail | `RESEND_API_KEY` |
| **your new domain** | Nova cold outreach | `OUTREACH_RESEND_API_KEY` |

Links in cold emails always point to **https://sere.cash/demo**.

---

## If something breaks

| Problem | Fix |
|---------|-----|
| `senderProblems` / same domain error | Outreach key or from-address still on sere.cash |
| Resend not verified | Wait for DNS, check registrar records |
| No drafts generated | Prospects missing `fact` in CSV |
| Send refused | Run `npm run outreach stats` — cap or circuit breaker |
| Invoices in spam later | Stop cold sends immediately, check complaint rate |

---

*Last updated: when you bought the outreach domain. Start at Part A if Sere is not live yet; start at Part E if Sere is already deployed.*

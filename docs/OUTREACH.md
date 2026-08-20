# Nova outreach

Cold email for Sere, run from the terminal. No routes, no UI, nothing a shop can
reach. Prospects live in their own database file, never in the tenant database.

The model is `gpt-4o-mini`. It is not the thing that makes the email good. Three
other things do:

1. **A researched fact per prospect.** Nova is a phraser, not an author. Without
   a real fact it will write "I hope this email finds you well," so a prospect
   with no fact is refused before it reaches the model.
2. **Examples that actually earned replies.** Past winners are retrieved and put
   in the prompt. A new winner changes the next send instead of the next
   retrain.
3. **A validator.** Every draft is checked before a human sees it: word count,
   banned bulk phrases, one question, no asking for a call, and proof that the
   body used the fact. Failures go back to the model with the exact problem.

Nothing sends without a person approving it.

---

## The domain rule

**Never send cold mail from the domain that sends invoices.**

Sere emails invoices from each shop's verified domain, with `RESEND_API_KEY` and
`SERE_EMAIL_FROM` as a deployment fallback. Cold mail earns spam complaints, and
complaints burn sender reputation. Share a domain or a provider account between
the two and invoices start landing in junk — which looks to a paying shop like
Sere is broken.

`senderProblems()` refuses to send when the outreach domain matches the
transactional domain, including subdomains, or when the two share an API key.
That check is the reason `lib/outreach/send.ts` exists.

Buy a separate domain for outreach — something like `getsere.com`, not
`sere.cash` — put it in a separate Resend account, and warm it up slowly.

---

## Setup

```bash
# Nova
OUTREACH_OPENAI_API_KEY=sk-...        # falls back to OPENAI_API_KEY
OUTREACH_MODEL=gpt-4o-mini            # optional

# Sending — must differ from RESEND_API_KEY and SERE_EMAIL_FROM
OUTREACH_RESEND_API_KEY=re_...
OUTREACH_EMAIL_FROM=you@getsere.com
OUTREACH_EMAIL_FROM_NAME=Isaac
OUTREACH_REPLY_TO=you@getsere.com

# CAN-SPAM requires a real mailing address on commercial email
OUTREACH_POSTAL_ADDRESS=1840 Fowler St, Fort Myers, FL 33901
OUTREACH_SENDER_NAME=Isaac

# Storage, kept away from shop data
OUTREACH_DATABASE_URL=file:./data/outreach.db
```

The signature, opt-out line, and postal address are appended in code, not asked
of the model. `List-Unsubscribe` headers are set so a recipient's mail client
offers one-click unsubscribe instead of the spam button.

---

## Autonomous mode

One command does the whole cycle with nobody in the loop. Cron it.

```bash
npm run outreach init
npm run outreach import prospects.csv

npm run outreach run -- --dry-run    # see the plan, send nothing
npm run outreach run                 # sync, check safety, draft, send
```

`run` does four things in order:

1. **Sync.** Pulls delivery results from the provider so bounces and complaints
   land in the database before anything decides to send.
2. **Check safety.** If a circuit breaker is open, it sends nothing and exits
   non-zero so cron surfaces it.
3. **Draft.** Only for prospects that have a fact, only up to today's headroom.
   Anything the validator won't pass is dropped rather than sent.
4. **Send.** Paced, and it re-checks the breaker every ten messages so a
   complaint landing mid-batch stops the rest of it.

It is safe to run more often than the cap allows. The cap is measured from what
was actually sent today, not from how often the command runs.

```cron
0 14 * * 1-5  cd /path/to/sere && npm run outreach run >> /var/log/outreach.log 2>&1
```

Weekdays only, once a day, mid-morning in your prospects' timezone.

### What autonomous does not mean

It does not mean "send as fast as possible." Volume ramps on a warmup schedule,
because mailbox providers judge a new domain on trend:

| Days sending | Cold emails per day |
| -----------: | ------------------: |
| 1–3 | 20 |
| 4–7 | 40 |
| 8–14 | 75 |
| 15–21 | 120 |
| 22–30 | 200 |
| 31+ | 300 |

And it stops itself. Sending halts when any of these is true:

- **2 spam complaints** in the last 500 sends. Two is a pattern, not luck.
- **Complaint rate over 0.3%** once there are 100+ sends. Gmail treats 0.1% as
  the danger line.
- **Bounce rate over 5%** once there are 20+ sends. That means a scraped or
  stale list.

When a breaker opens, fix the list or the copy. Do not raise the threshold — the
threshold is the only thing standing between a bad list and a dead domain.

`npm run outreach stats` shows the current cap, today's count, and whether a
breaker is open.

### What still needs a human

Replies and signups. A reply arrives in a mailbox, not in the sending API, so
catching it automatically needs an inbox connection (IMAP or an inbound-email
provider) that does not exist yet. Bounces and complaints — the two signals the
breakers read — are pulled automatically.

That split is deliberate: the autonomous path never depends on the good
outcomes, only on the dangerous ones.

```bash
npm run outreach outcome replied elena@harborair.example
npm run outreach outcome signup  elena@harborair.example
npm run outreach outcome demo    ray@gulfplumb.example
```

Recording replies is what teaches Nova. Skip it and it keeps drafting from rules
alone forever.

## Driving it by hand

If you'd rather read every email before it goes:

```bash
npm run outreach draft -- --limit 10
npm run outreach review
npm run outreach approve all
npm run outreach send -- --limit 10
npm run outreach stats
```

`stats` prints reply rate, per-variant results, and which emails Nova is
currently learning from.

### The CSV

`company` and `email` are required. `fact` is what makes the email work.

```csv
company,contact,email,trade,city,website,fact
Harbor Air,Elena Vasquez,elena@harborair.example,hvac,Fort Myers,harborair.example,"your site takes service calls by phone only, no request form"
```

Re-importing the same list updates rows instead of duplicating them, and a blank
`fact` never overwrites one you already researched.

A good fact is specific and checkable: "no request form on your site," "your
booking page has been down since spring," "you list 14 trucks but one phone
number." A bad fact is a category: "you're in HVAC." Import warns about
prospects that are not ready.

---

## How outcomes are scored

| Outcome | Points |
| ------- | -----: |
| Signup | +100 |
| Reply | +30 |
| Demo opened | +8 |
| Bounced | −5 |
| Complained | −100 |

An email that drew a complaint is never used as an example, whatever else it
earned. Retrieval prefers the same trade first, then the stronger outcome —
how you write to a roofer is not how you write to a salon.

Variants get a fair sample (20 sends each by default) before the better one
takes over, so one lucky early reply cannot decide the campaign.

---

## When fine-tuning is worth it

Not yet. Good few-shot prompting with real winners beats a fine-tune until you
have a few hundred replied-to emails, and it stays debuggable — you can always
see which examples produced a draft. When there is enough volume, the reason to
fine-tune is to bake in voice and shrink the prompt for cost, not to raise
quality.

---

## Porting to another product

Nothing in `lib/outreach/` imports the app. It talks to the APIs over `fetch`
and owns its own database, so copying the folder and editing one constant is the
whole job:

- `SERE` in `lib/outreach/copy.ts` — name, pitch, the one ask, the link
- `BANNED_PHRASES` in the same file if a different market has different tells
- `OUTREACH_DATABASE_URL` so the two products keep separate lists

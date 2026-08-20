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

## The loop

```bash
npm run outreach init
npm run outreach import prospects.csv
npm run outreach draft -- --limit 10
npm run outreach review
npm run outreach approve all
npm run outreach send -- --limit 10

# then, as things come back — this is the part that teaches Nova
npm run outreach outcome demo    ray@gulfplumb.example
npm run outreach outcome replied elena@harborair.example
npm run outreach outcome signup  elena@harborair.example
npm run outreach outcome complained someone@angry.example

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

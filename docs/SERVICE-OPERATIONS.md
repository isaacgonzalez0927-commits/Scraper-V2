# Sere service operations

This release turns Sere's existing customer, job, estimate, invoice, payment, and cash book into a connected service-business workspace.

## Connected workflow

1. A request enters through the office or the shop's public `/book/[slug]` page.
2. The office qualifies it and converts it to an estimate or an unscheduled job. Repeating a conversion does not create a second job.
3. Dispatch assigns an active crew profile, start time, duration, and priority. Job forms, the dispatch board, and calendar rescheduling all use the same transactional overlap check and schedule version.
4. The field workspace captures checklists, notes, time, and compressed photos. Updates first enter an IndexedDB queue and are removed only after the server confirms them. A mutation key prevents a retry from creating a duplicate record.
5. Time logged against an assigned crew member records labor cost from that profile's loaded hourly cost. Inventory used on a job records material cost and cannot take stock below zero.
6. The existing finish-and-collect flow closes the job, creates or updates its invoice, and uses the existing Stripe, Square, PayPal, QuickBooks, and email integrations.

## Data safety

- Every new query and mutation includes `organization_id`; referenced customers, properties, jobs, crew, plans, equipment, and stock are checked against the same business.
- Scheduling is checked inside the same write transaction as the assignment. `schedule_version` rejects a stale dispatch dialog instead of silently replacing another dispatcher's change.
- Request, stock, field, agreement-visit, and follow-up keys are unique inside one business. Safe retries return the original result.
- Follow-ups are drafts. Before sending, Sere checks the rule is still enabled and the invoice, estimate, customer email, amount, or service plan is still eligible. Ambiguous provider failures are marked `uncertain`; Sere does not blindly resend.
- Existing tables and IDs are preserved. Migrations create new tables and add workflow columns to existing tables, and are safe to run again on a cold start.

## Honest boundaries

- Field updates survive a dropped connection while the field page remains loaded. This release does not install a service worker, so it does not promise a fresh app launch with no connection.
- Dispatch can open the day's ordered stops in Google Maps. It does not claim automated route optimization, traffic-aware ETAs, or customer tracking links.
- Crew profiles are scheduling and costing records, not login accounts. The existing membership role remains the authorization source; a complete technician-only permission system is separate work.
- Service plans track amount, billing cadence, visit cadence, renewal, and visit generation. They do not automatically charge a card. The office bills through Sere invoices.
- Follow-ups use the shop's configured Resend email. SMS, voice reception, and automatic no-review sending are not enabled by this release.
- Photos are resized and kept on the job record, capped at 25 per job. Large long-term photo libraries should move to object storage before production scale.

## Verification

Run:

```bash
npm test
npm run build
```

The operations tests cover repeatable migrations, organization-scoped idempotency, schedule boundary rules, end-of-month agreement cadence, and use of the shared transactional scheduling path.

## Connected-workflow follow-up

- Requests now create a linked, unpriced estimate draft rather than merely opening a blank form. Repeating conversion returns that draft. Approval-to-job conversion carries the request address and priority and marks the request Booked.
- Completed work is saved separately from the original scope. Closeout, extra costs, invoice creation, numbering and history commit in one transaction. A closeout key and job version prevent duplicate submissions or stale forms from adding costs again.
- No-charge visits explicitly carry a no-charge flag, never generate an invoice from the job, and are excluded from unbilled work and revenue. A live linked invoice must be resolved before a visit can be marked no charge. Pre-existing no-charge notes from older versions are not automatically reclassified; review those legacy jobs explicitly.
- New estimate-to-job conversions use the discounted pre-tax charge. Invoice creation retains the approved estimate's tax rate and adds tax once. Legacy converted jobs keep their existing amounts; review their final pre-tax charge before invoicing.
- Closeout preserves invoice discounts and existing line descriptions. A changed charge on an itemized draft must be resolved on the invoice before the job can finish; an unchanged itemized invoice is preserved.
- Approved estimates are shown as future work, not added to earned balances in Collect.
- Both Serenity interfaces now use the checked dispatcher. Completion requests return an owner-review closeout link, never a silently changed status. Serenity's shop read includes bounded lists of new requests, unassigned jobs, due plan visits, low stock and the count of drafts awaiting approval.
- The job record links its originating request, approved estimate, field record and invoice balance. Lower-frequency management tools are grouped under Manage business; daily work remains visible.
- Real SQLite workflow tests exercise request-to-estimate-to-job conversion, tax-once behavior, closeout rollback/retry, no-charge exclusions, foreign records, inventory/labor retries and Serenity dispatch/closeout behavior. They do not substitute for browser or field-user acceptance testing.

# Nova Growth Manager — staged rollout

## Scope

Nova is now Sere's growth manager, working with the existing Nexus pipeline.

- A daily, idempotent management cycle examines pipeline and conversion metrics.
- Nova finishes queued research/drafting before buying more lead searches.
- At most one market/trade search is added by the manager per day.
- Market rotation and measured replies inform trade selection.
- AI adds strategy insight but cannot send messages, set spending limits, or authorize contact.
- Goals, actions, outcomes, and errors are persisted and visible at /nova.
- AI-reviewed drafts become pending_approval when manager mode is enabled.
- Only the verified operator can approve the exact draft and recipient.
- Outbound email is guarded again at send time; held tasks are not marked as completed.
- Serenity remains separate.

## Staging activation

1. Start from known working production commit ca3bdf044f47d62448f661743c2c3cce00ceb08d.
   GitHub main has later changes not in the working production rollback. Do not merge blindly.
2. Deploy this development branch to a separate Vercel staging project and separate test database.
3. Set NOVA_MANAGER_ENABLED=true ONLY in staging to enable the daily cycle.
4. Set NOVA_MANAGER_CITIES to approved cities separated by semicolons.
   Example: Fort Pierce, FL;Stuart, FL;Vero Beach, FL.
   No cities configured means ZERO Google Places searches by the manager.
5. Optional NOVA_MANAGER_TRADES=hvac,plumbing,electrical.
6. Optional NOVA_MANAGER_MODEL=gpt-4o-mini and NOVA_MANAGER_AI_ENABLED=false.
7. Existing OPENAI_API_KEY, GOOGLE_PLACES_API_KEY, and Nexus provider keys power the model
   and pipeline. Costs still depend on providers and actual work.
8. Configure CRON_SECRET (or NEXUS_CRON_SECRET for a trusted external scheduler)
   for /api/nova/manager/tick. NEVER pass a token in a URL query or logs.
9. Schedule the protected manager endpoint daily. To finish the queue throughout
   the day, an external cron should invoke the existing /api/nexus/tick worker
   at an approved cadence. A single daily manager call does only one Nexus job.
10. Keep NEXUS_SEND_ENABLED OFF until cold-domain separation, deliverability,
    real postal address, unsubscribe handling, and human approval have been checked.

## Release checks

- npm ci; npm test; npx tsc --noEmit; npm run build.
- Non-operator access returns 403 for manager and approvals.
- Unauthenticated cron returns 401.
- Feature gate OFF cannot run the manager.
- Running twice in one day is idempotent.
- Unconfigured cities do not invoke paid Places.
- State-abbreviated city names match Google Places localities.
- AI-reviewed drafts without operator approval cannot send.
- The actual send checks window, daily cap, safety breakers, and operator authorization.
- Deferred sends are not reported as completed.
- Existing Serenity, billing, auth, and customer flows are unaffected.

## Known unfinished work

Automatic inbox ingestion, real reply recognition, end-to-end paid-subscription
attribution, experiments, and fully hands-off multi-turn sales conversations
are not part of this safe first release. Nova must not claim they exist.

## Production safety

This branch, its changes, and its deployment settings are isolated from
the running Vercel production rollback. Do not deploy or merge until staging
build, database migration, email safety, and approval screens are verified.

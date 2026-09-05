# Selective social acquisition: implementation checkpoint

This is a partial implementation, NOT a functioning three-platform discovery engine.

## Implemented

- Existing Instagram cron applies explicit seasonal-offering and strictly >1000
  observed-like gates before candidate storage. Watching a handle does not approve it.
- Pure reviewed-creator policy supports platform/handle identity and expiring approval.
  No production creator registry is populated or wired yet; no follower threshold is invented.
- Missing engagement stays unknown. Exceptions do not expose provider tokens.
- Failed sources become retryable after 24 hours instead of remaining skipped forever.
- Missing Instagram configuration returns 503 and attempts an operational pulse.
- Results identify partial source failure, inspected metadata, rejection reasons and
  qualified candidates. Candidates remain private and do not become events.

## Not completed or enabled

- Verified Florida destination matching (a creator's home city is not proof).
- Authorized creator registry storage and qualification review workflow.
- TikTok/Facebook access, adapters and provider rights approval.
- LLM extraction integration, publication quality verification, trend snapshots and weekly report.
- Live social permissions/credentials verification and end-to-end production test.

The repository's existing refresh/shuffle implementation is untouched. No new paid
provider or LLM calls are introduced. A metadata request is still necessary before
likes can be evaluated. The taxonomy is a conservative first pass, not semantic
proof that an experience is good or currently available.

## Verification

Run `node scripts/check-social-qualification.mjs` and the full repository guard suite.
The new guard is included in scripts/guards.txt. Changing the strict likes boundary
to accept exactly 1000 was applied and caused the guard to fail; the rule was restored.

Do not deploy this checkpoint as a completed engine. Confirm existing database count
columns accept null before deployment. Complete source-access setup and destination
verification before enabling any publication. No raw provider content resale is authorized.

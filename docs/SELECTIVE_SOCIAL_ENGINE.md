# Selective social acquisition and identity engine

This is a private lead-acquisition and identity pipeline. It is not permission to
scrape social sites and it never publishes a place or event by itself.

## Implemented

- Existing Instagram cron requires an explicit seasonal offering, then one quality
  path: current owner review; at least 10,000 followers observed by Meta Business
  Discovery; or strictly >1000 observed likes. Watching a handle does not approve it.
- The scout loads an expiring, evidence-backed `wf_social_creators` registry.
  Watched handles are not trusted unless the owner review is current.
- Missing engagement stays unknown. Exceptions do not expose provider tokens.
- Failed sources become retryable after 24 hours instead of remaining skipped forever.
- Missing Instagram configuration returns 503 and attempts an operational pulse.
- Results identify partial source failure, inspected metadata, rejection reasons and
  qualified candidates. Candidates remain private and do not become events.
- A second daily job resolves location through this strongest-evidence-first ladder:
  reviewed creator/place mapping; stable provider place ID; location-tag name plus
  coordinates; literal venue and city; literal unique venue name. Only the first two
  are automatically verified. All text/model matches remain candidates.
- Optional LLM extraction reads only qualified captions, preserves exact evidence,
  caps each run at 20 calls, and is off unless `SOCIAL_LLM_ENABLED=1` plus an existing
  AI key are present. Model output cannot publish or independently verify identity.
- Field-level evidence defaults to internal use only, no display, no raw resale and
  no commercial API exposure. A private seven-day Florida category report is stored
  after enrichment and available only through the secret-protected internal route.
- The Meta adapter is registered in `wf_source_registry`. Every Graph request must
  atomically reserve one zero-cost unit before it runs. A single 50-call
  Florida/Eastern calendar-day ceiling covers all Meta capabilities together;
  paid fallback is refused.

## Still requires deployment/configuration

- TikTok/Facebook access, adapters and provider rights approval.
- Applying the migration, populating reviewed creator/place mappings, and verifying
  the Meta credentials against live production data.
- Authoritative venue/ticket/date verification and the later publication decision.

The repository's existing refresh/shuffle implementation is untouched. The default
path makes no paid-provider or LLM calls. A metadata request is still necessary
before likes can be evaluated. The taxonomy is a conservative first pass, not
semantic proof that an experience is good or currently available.

## Verification

Run `node scripts/check-social-qualification.mjs`,
`node scripts/check-social-intelligence.mjs`, and the full repository guard suite.
The new guard is included in scripts/guards.txt. Changing the strict likes boundary
to accept exactly 1000 was applied and caused the guard to fail; the rule was restored.

Apply the migration before either cron is enabled. Keep publication disabled until
the separate authoritative verification stage exists. No raw provider content resale
is authorized.

## Release hold: supersedes earlier completion claims

This branch is a draft. The social-intelligence handler returns 503 before database
or paid-model work and is not scheduled. Creator associations and upstream IDs
produce candidates only: neither proves the destination of a specific post.
Explicit city conflicts stop name-only matching. Inventory status uses OPERATIONAL.

Remaining release blockers: complete inventory pagination, post-specific identity
verification, authoritative Florida boundary confirmation, source-rights and retention
approval, enforced durable model spending limits, fresh qualification checks,
resumable processing, accurate write-failure reporting, and Florida-only deduplicated
trend observations with complete reporting windows. Meta field support and credentials
must be verified live. Existing green fixture tests do not prove these conditions.
No production migration, rollout or publication is authorized by this document.

## Read-only preflight update

The enrichment handler now runs an authenticated, unscheduled, read-only preflight
against existing production columns. It reads inventory with OPERATIONAL status,
continues keyset pagination through server-capped short pages, and fails on a ceiling
or malformed cursor. It rechecks the strict likes gate, excludes previously rejected
leads, deduplicates posts and returns private location candidates. It makes no model
calls and writes nothing. Current reviewed creators and official follower observations
can qualify acquisition; neither can approve publication. This supersedes the 503-only hold
for the handler, but publication and automated acquisition release remain blocked.

Production read on 2026-09-06: wf_social_candidates=0 and wf_social_source_health=0.
No new card can be truthfully attributed to automated acquisition yet.

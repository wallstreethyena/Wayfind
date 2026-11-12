# Wayfind Instagram → Trending pipeline ("Seen on Wayfind")

Owner requirement (2026-11-12): every eligible Reel or carousel Wayfind publishes on
@gowayfind.app appears under the TRENDING NOW poster. **Eligible posts missing from
Trending must stay 0, and a miss must be detected, not noticed by hand.**

## Lifecycle

| Stage | Where | Shown to visitors? |
|---|---|---|
| CREATED / SCHEDULED | `wf_owned_social.lifecycle` = `created` / `scheduled` (from Metricool's scheduled posts) | Never |
| PUBLISHED | lifecycle `published` once the source lists it as published | Yes, if eligible and live |
| INGESTED | `first_ingested_at`, `last_seen_at` | |
| TRENDING VERIFIED | `trending_verified_at`, stamped by the monitor when the live shelf served it | |

## Sources (in order of preference)

1. **Instagram Graph API, Wayfind's own media** (`/{ig-user-id}/media`), read by
   `/api/cron/owned-social`. Ships dark until `IG_GRAPH_TOKEN` and
   `IG_BUSINESS_ACCOUNT_ID` are set (docs/INSTAGRAM_SETUP.md). Fully automatic.
2. **Metricool** (already connected to @gowayfind.app): the scheduled task
   "Wayfind Instagram → Trending ingestion" reads every published Reel and feed
   post plus scheduled posts, classifies new ones, upserts `wf_owned_social`, checks
   that every source post has a row, and pulses `owned-social-ingest`.

## Eligibility

Default: **eligible**. A post is excluded only with a stored reason (CHECK constraint):
`format_single_image`, `brand_promo_no_discovery`, `ad_creative`,
`companion_duplicate` (`companion_of` names the kept post), `not_florida`,
`owner_excluded`, `rights_restricted`, `deleted_on_instagram`.

## What the shelf shows

`lib/ownedSocial.js selectShelf`: every published, eligible Reel and carousel that is
**live**, newest first, one card per post, never capped. Live means `relevant_until`
has not passed (dated guides) or, when undated, published within 45 days. Expired
posts stay in the table and are counted as excluded with reason `expired`. The
shelf is its own row at the top of Trending and never takes a slot from the five
earned shelves, so owned posts cannot starve or be starved.

## Monitoring (fail loud)

`/api/cron/owned-social` (twice daily) fetches the shelf **through the CDN** the way
a visitor does, reconciles it against the table, and pulses
`owned-social-reconcile` with `succeeded = 1` only when missing = 0, broken = 0 and
ingestion is fresh (last ingest within 36 h). Two failed runs in a row are a
job-watch incident; a dead shelf endpoint (`unavailable:`) pages on the first run.
The note names the first offending shortcodes.

## Regression guard

`scripts/test-owned-social-reconcile.mjs` (in `scripts/guards.txt`, blocks CI and
deploy) executes the rules, the endpoint, the monitor and the rendered shelf, with
nine negative controls that must each go red.

## Buckets

A present and correct · B present but misassociated · C ingested but not trending ·
D missing from Wayfind · E excluded with reason · F broken. C, D and F are defects.

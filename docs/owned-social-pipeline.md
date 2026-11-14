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
**live**, newest first, one card per post, never capped. Live means:

- dated guides (`relevant_until` set): until that date, then hidden automatically;
- `evergreen = true` place content: stays live past the window;
- everything else: published within 45 days.

Expired posts stay in the table and are counted as excluded with reason `expired`.
The shelf is its own row at the top of Trending and never takes a slot from the five
earned shelves, so owned posts cannot starve or be starved.

**Paging.** `/api/owned-social?offset=N` serves 12 posts per page (max 24) with
`total` and `next_offset`. The shelf loads page 1, then the next page only when the
visitor swipes near the end. CDN cache 5 min, stale-while-revalidate 10 min.

**Reel and carousel pairs.** The stronger post is eligible; the twin is excluded as
`companion_duplicate` with `companion_of` naming the kept post. Both stay in the table.

**Titles.** `cleanDisplayTitle` strips leaked internal phrases ("here it is with",
"main carousel caption", "comment X and I'll send", "link in bio", URLs), emoji and
dashes, caps at 60 characters, and falls back to "Wayfind Reel, <city>". Instagram
captions themselves are never modified.

**Playback and links.** Tapping plays the post in a Wayfind dialog (iframe unmounts
on close, so audio stops), with `@gowayfind.app`, "Watch on Instagram" and, from
`wayfind_links`, "See <x> on Wayfind" (same-site `/florida-events/<slug>` or `/p/<id>`
only, max 4).

**Decisions are sticky.** `decision_source` is `auto`, `audit` or `owner`. Sync never
changes eligibility, reason, title, evergreen or links on an existing row: the insert
ignores duplicates and the follow-up PATCH sets only `last_seen_at`, `lifecycle`,
`updated_at` (locked by the regression guard).

## Analytics funnel (PostHog)

`owned_social_impression` (shelf 40% on screen, once) → `owned_social_open` (card tap,
with rank) → `owned_social_player_loaded` (embed loaded; Instagram reports no play
event to the page, so this is the honest proxy for a play) → `owned_social_instagram_open`
/ `owned_social_wayfind_open`.

## Runtime only, never a deploy blocker

The build guard locks code and invariants with fixtures. Real posts, Metricool and
Instagram are checked only at runtime by the cron below, which alerts through
job-watch. An outage or an old post can never block a deploy; a failed shelf read
renders nothing and leaves the other Trending shelves untouched.

## Monitoring (fail loud)

`/api/cron/owned-social` (twice daily) fetches the shelf **through the CDN** the way
a visitor does, reconciles it against the table, and pulses
`owned-social-reconcile` (walking every page) with `succeeded = 1` only when missing = 0, broken = 0 and
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

## The daily Metricool ingestion task (until Graph credentials exist)

Scheduled task "Wayfind Instagram → Trending ingestion", 8:47 AM and 8:47 PM ET,
created only after `wf_owned_social` exists. Each run:

1. Incremental: read Reels (Metricool IGRE02/IGRE04/IGRE06/IGRE03/IGRE05) and feed
   posts (IGPO02/IGPO04/IGPO06/IGPO07/IGPO03/IGPO05) for brand 6668336 only from the
   watermark (newest `published_at` in the table minus 3 days) to now. Once a week
   (Sunday evening run) sweep from 2026-08-01 to catch deletions. Never reprocess
   the full catalog on an ordinary run.
2. For each post not yet in `wf_owned_social`: classify it with the rules above
   (default eligible; exclusion only with a listed reason), write a dash free
   title of at most 60 characters, city, region, places, relevant_until, evergreen,
   `decision_source = 'auto'`.
3. Upsert by shortcode (never overwrite an existing classification), refresh
   `cover_source_url` for rows without a stored cover, mark scheduled rows
   `published` once Metricool lists them as published.
4. Completeness: every source shortcode must now have a row. Pulse
   `owned-social-ingest` (`attempted` = source posts, `succeeded` = posts with a
   row, `failed` = posts without one). A run that cannot read Metricool pulses
   `unavailable: metricool read failed` so job-watch pages on the first run.

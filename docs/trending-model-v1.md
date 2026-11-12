# Wayfind Trend Score V1

Version `v1-2026-11-12`. Code: `lib/trendEngine.js` (pure scorer), `lib/trendingSocial.js`
(social candidates and the zero-miss audit), `lib/trendingSocialServer.js` (production data),
`app/api/trending/social/route.js` (the shelf and `?audit=1`). Guards:
`scripts/test-trend-engine.mjs`, `scripts/test-social-trending.mjs`; production monitor:
`scripts/check-social-trending-live.mjs` (canary, every 30 minutes).

## What "trending" means here

Something is trending when there is fresh evidence that people care about it **now**, near the
person looking. Lifetime popularity (rating, review count, follower count) is deliberately not an
input: it is what makes "trending" lists show the same famous places forever. Every point a card
earns is written to a receipt (`?why=1`) and every label on a card must be backed by a receipt
line.

## Score (0 to about 100)

| Part | Max | Evidence |
|---|---|---|
| Freshness (social) | 30 | Post age; 30 points the day it posts, decays with a 7 day time constant, gone after 30 days. A post about an event still ahead (starts within 45 days) or in season stays eligible up to 120 days. |
| Urgency (events) | 25 | Today 25, next 3 days 18, this weekend 15, next 10 days 8, next 30 days 3; final 3 days of a run +8. |
| Momentum: Wayfind velocity | 20 | Our own users' opens, saves, shares, stop adds, likes and partner clicks for the place: last 3 days per day vs its own prior 14 days, smoothed (prior 1, needs 3 recent). Max at 3 doublings. |
| Momentum: owned post engagement | 10 | Views per day of our post vs our account's median. |
| Corroboration | 24 | 6 per distinct independent creator on the same subject (max 4). Venue, organizer, tourism and aggregator accounts do not count (`lib/creatorIndependence.js`). |
| Local relevance | 20 | Distance decay (35 mile constant), never zero; unknown location 10. |
| Quality / trust | 8 | Has a first party photo 3, verified/open 3, a working Wayfind page 2. |
| Novelty | 8 | New on Wayfind in the last 14 days. |
| Penalties | | Not verified in 21 days −5, approximate location −3, sold out −25. Ended or cancelled events are not eligible. |

### Anti rich get richer and anti manipulation

- Velocity compares a thing to **its own** baseline, so a big place at its normal level scores
  low and a small place doubling scores high.
- A device counts at most once per place per day per action; devices with more than 20 rows on a
  place in a day are dropped for that day; rows without a device are ignored. A hundred clicks
  from one browser are one signal (asserted in `test-trend-engine`).
- No input can be bought or self posted: our own posts earn freshness, not corroboration;
  organizer accounts never count as creators.
- Diversity: one card per subject (other posts ride as alternates), at most 4 per metro in the
  top 12. Diversity only reorders, it never drops an eligible item.

## Worked examples (asserted in `scripts/test-trend-engine.mjs`, viewer in Sarasota)

| Example | Score | Why |
|---|---|---|
| Local event tonight | 53.0 | Urgency today, nearby. Ranks above the far viral event. |
| Far away viral event (Miami, 6 creators) | 50.1 | Strong corroboration but 200 miles; beats evergreen places. |
| Gaylord Palms Christmas (fresh creator reel, opens tomorrow) | 49.9 | Freshness + urgency. |
| New small Christmas café (Parrish, rising Wayfind interest) | 46.9 | Velocity + novelty; beats Disney Springs. |
| Brand new Wayfind Reel, no engagement yet | 43.6 | Freshness only; below the event tonight. |
| Surfing Santas (Dec 24, organizer's own reel) | 34.4 | Fresh post, event 6 weeks out, organizer is not corroboration. Visible, not inflated. |
| Evergreen attraction, no momentum | 14.0 | Nothing new is happening. |
| Disney Springs at its normal level | 9.6 | Huge but flat: no momentum. |

## Architecture

`candidates {kind, id, entity, signals}` → `trendEligibility` (timing) → `scoreTrendCandidate`
(score + receipt + labels) → `rankTrendCandidates` (collapse per subject, metro diversity). Any
subject works: event, place, guide, page, or the post itself; no place id is required. Heavy work
is server side; the browser only receives the page of cards it shows (`/api/trending/social`,
cached 10 minutes in the function, 5 minutes at the edge).

## Social zero-miss lifecycle

CREATED / SCHEDULED (never shown: `status` must be `published`, and a publish time in the future
is `not_yet_published`) → PUBLISHED → INGESTED (`data/social/wayfind-instagram.json`, compiled to
`lib/wayfindSocialAssets.generated.js`; plus `wf_social_assets` once applied) → ENTITY MATCHED →
TRENDING ELIGIBLE → TRENDING VERIFIED (`?audit=1`: missing, unknown, broken, duplicates must be 0).
Every post lands in exactly one bucket: in a card, excluded with a reason (`brand_post`,
`aged_out`, `event_ended`, `twin_of_excluded:…`, `subject_not_on_wayfind`, …) or broken.
Carousels are one card; their animated Reel twins ride in the same card.

## Cutover

The social shelf runs on V1 now. Place and event shelves keep their current ranking (shadow):
`node scripts/trend-shadow-report.mjs` re-ranks the live place pool with V1. First run
(2026-11-12, Orlando, no velocity credentials): 0 of 12 top places shared. Without momentum
evidence V1 reduces to distance, so the place shelves are not cut over until velocity covers
most of the pool. Cut over when, for two weeks, the report run with production credentials shows
velocity on at least half the pool and V1's top 12 earns a higher open rate in the
`trend_social_open` / `detail_open` events than the current order.

## Data gaps (known)

- The `events` table carries `place_id` but no `event_id`, so events have no first party
  velocity yet.
- Save and share events look under instrumented; velocity leans on opens and partner clicks.
- Events have no `created_at` in the served columns, so event novelty is not scored.

## Future model (learning to rank)

Every receipt line is a feature. Log `(receipt, position, opened, saved, clicked)` per
impression; once there are a few thousand opens per week, fit a pairwise model on the same
features and keep V1 as the fallback and the explanation. Keep the hard rules (eligibility,
penalties, no lifetime popularity, bot caps, diversity) outside the learned part.

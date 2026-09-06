# Dirty-tree classification — primary clone, 2026-09-04

64 modified + 143 untracked files in the primary clone, on a base 627 commits behind
`main`. None of it is applyable as a patch; each bucket must be **re-implemented** on
current `main`. Preserved at `wip/snapshot-20260904` and `_backup/wip-snapshot-20260904.tar.gz`.

Three unrelated workstreams were tangled together in one dirty tree.

## Bucket A — TikTok-required (12 files) — NOT on main, rebuild first

New files (all untracked, all absent from the `git diff` backup):
`lib/tiktokPixel.js` (9,765 b) · `app/components/TikTokPixel.js` (3,661 b) · `scripts/test-tiktok-pixel.mjs` (8,691 b)

Modified: `lib/track.js` · `app/layout.js` · `app/home.js` (wiring only) · `next.config.js` (CSP) ·
`.env.local.example` · `scripts/check-env.mjs` · `scripts/guards.txt` · `package.json` (check:jsx list)

Confirmed absent from `main`: 0 tiktok references in `lib/track.js`, `guards.txt`,
`.env.local.example`. `main`'s only tiktok mention is `frame-src https://www.tiktok.com`
(player embeds), unrelated to the pixel.

**Why it matters commercially:** the FL Spark campaign is live with no pixel, so TikTok
can only optimize toward clicks. No conversion signal, no retargeting pool, no per-creative
attribution.

Design already in the WIP and worth carrying forward:
- no-op when `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is unset (`skipped: "no_pixel_id"`)
- never loaded inside the native Capacitor shell
- mirrors from the same choke point as the Google forward, so conversions keep one owner
- only 5 mapped conversion events; `screen_view`, impressions and result counts return
  `skipped: "unmapped"` and never reach TikTok
- dedupe keys namespaced per bridge, so a Google skip cannot suppress the TikTok send
- CSP adds `analytics.tiktok.com` to `script-src`, `connect-src` **and** `img-src`
  (the SDK falls back to an image beacon), with the reasoning recorded inline

Still to verify on the rebuild: single pixel load, no double page-view fire across Next
client navigation, no PostHog duplication, owner/internal traffic exclusion intact,
consent behaviour matching existing policy.

## Bucket B — `credential()` env hardening (35 files) — partially on main

`lib/envPlaceholder.js` and its `credential()` helper are **already on `main`**, used by 14
files. The WIP extends the same pattern to 35, of which:
- **8 already covered on main** — drop, no action
- **27 not yet on main** — a coherent mechanical follow-on, its own PR

Not on main yet: the 16 metered API routes (`places/*`, `ta/place`, `youtube`, `fsq/search`,
`photo`, `outdoors`, `sources/compare`, `events`, 5 cron routes), `PostHogProvider.js`,
`SentryClient.js`, and 9 libs (`google`, `aiKey`, `envAudit`, `eventResolve`, `insiderServer`,
`landing`, `placeDetails`, `popularity`, `serverEvents`).

## Bucket C — unrelated feature WIP (~700 lines) — DECISION NEEDED

Distinct, unfinished features that happen to share the folder. Each would be its own PR,
each needs re-implementation on a 627-commit-newer base:

| Work | Files | Size |
|---|---|---|
| Clipp per-merchant offers | `lib/clippOffers.js`, `scripts/check-clipp-deals.mjs` | +398 |
| Coverage-watch cron | `app/api/cron/coverage-watch/` (new), `vercel.json`, `scripts/test-coverage-watch.mjs` | new route |
| City unlock | `app/api/city/unlock/route.js` | +94 |
| Foursquare search | `app/api/fsq/search/route.js` | +100 |
| Inventory serve | `lib/inventoryServe.js`, `scripts/test-inventory-serve.mjs` | +97 |
| Signup route | `app/api/signup/route.js` | +49 |
| Coupon/deal surface | `lib/coupons.js`, `lib/dealSheet.js`, `lib/deals.js`, `screens/Coupons.js` | +119 |
| Guides page | `app/guides/[slug]/page.js`, `lib/guides.js` | +59 |
| CreatorFinds | `app/components/CreatorFinds.js` | +38 |

Some of this may already exist on `main` in another form — `main` moved 627 commits since
this work started. Each item needs its own present-on-main check before any rebuild.

## Bucket D — already on main

The 8 `credential()` files listed in Bucket B. No action.

## Bucket E — obsolete

`app/home.js` as a whole file: the WIP version carries the rejected "Featured deals" hero
(see `BRANCH-AUDIT-summer-2026-city-guides.md`) plus a 627-commit-stale base. Take the four
TikTok wiring lines only; discard the file.

## Order

1. Bucket A as one PR — smallest, highest commercial urgency
2. Bucket B as one PR — mechanical, 27 files
3. Bucket C — per-item decision, one PR each, only after a present-on-main check
4. Delete `feat/summer-2026-city-guides` once A is merged and C is decided

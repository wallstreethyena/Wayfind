# Bucket C audit — 9 unrelated WIP features vs current `origin/main`

Synced against the real remote before starting. `origin/main` = `9f1a32a3` (2026-09-04 15:06 -0700).
Guard registry read live at audit time: **521 guards** in `scripts/guards.txt`.
WIP base is 627 commits behind that tip.

**Nothing was rebuilt, cherry-picked, merged, modified or deleted. The snapshot
(`wip/snapshot-20260904`, `_backup/wip-snapshot-20260904.tar.gz`) is untouched and stays
until every survivor is deliberately rebuilt or deliberately rejected.**

Comparison was on behaviour and intent, not filenames. Several features exist on main
under different names, in different files, via different designs.

## Tally

| Status | Count |
|---|---|
| ALREADY SOLVED | 6 |
| PARTIALLY SOLVED | 2 |
| STILL MISSING | 1 |
| OBSOLETE | 0 |
| CONFLICTS WITH CURRENT ARCHITECTURE | 0 |

Six of nine old parts already have a newer part fitted. Two need only a small delta. One
is genuinely absent.

## The table

| Feature | Old WIP purpose | Current-main equivalent | Status | Evidence | Recommendation |
|---|---|---|---|---|---|
| **Clipp per-merchant offers** | Registry of ~48 browser-verified single-venue Clipp certificates; widen `isClippDest` to the `/all-offers/<slug>` shape; guard the new family | Same registry, merged and since grown to 542 lines (Orlando, Zellwood, Dave & Buster's) with sold-out handling added | `ALREADY SOLVED` | `lib/clippOffers.js:125` `CLIPP_MERCHANT_OFFERS` (superset of WIP); `lib/deals.js:131` `isClippDest` allows `/all-offers/[a-z0-9-]+/?$`, identical shape. Commits `27dab403` (#644), `4f92983c` (#914). Guard: `scripts/check-clipp-deals.mjs` | None. Do not reintroduce; main's registry is newer and larger |
| **Coupon / deal surface** | Wire merchant offers into `COUPONS`; venue-photo thumb tile on the coupon card; extend `METRO_TOWNS` | Shipped as `CLIPP_MERCHANT_COUPONS`, then improved: thumb falls back to a Google `place_id` photo, then a market stock photo, before icon-only, at `w=560` not `w=160` | `ALREADY SOLVED` | `lib/coupons.js:250`; `app/components/screens/Coupons.js:118-134`. **The WIP's own data was wrong and main corrected it**: WIP mapped `parrish` and `ruskin` to `stpete`; main maps `parrish -> sarasota`, `ruskin -> tampa` (`lib/dealSheet.js:98,109`) per owner-screenshot fix `490f0cad` (#797), dated after the WIP's base | None. Explicitly do NOT resurrect the WIP's geo mapping |
| **Inventory serve** | Add `geoBox()` so a `limit=1000` read is geo-scoped before the JS distance filter, stopping silent truncation in dense metros | Same diagnosis, same fix shape, shipped earlier and independently as `boxForRadius()`, plus a second deeper bug the WIP never spotted (narrow-chip filter ran after the cap, not before) | `ALREADY SOLVED` | `lib/inventoryServe.js:213` `boxForRadius`, used at `:248`. Commit `cc7e7516` (#937) cites the same measurement class. Extended by `lib/inventoryBoxBatch.js:67`. Guards: `scripts/test-inventory-serve.mjs`, `scripts/check-narrow-chip-inventory.mjs` | None |
| **Signup route** | Persist signup emails to `wf_email_signups` instead of relying on Vercel log retention | Present, **byte-for-byte identical** | `ALREADY SOLVED` | `diff` of WIP file vs main file returns no differences. Shipped `c90ba681` (#645), 2026-08-07 | None |
| **Guides page** | Four bundled asks: editorial place cards, fix the "Open in Wayfind" CTA geocoding to the wrong area, an email-capture block, an evergreen Gulf Coast cluster | All four on main, more developed. Place cards resolve by exact `placeId` **and** fuzzy geo-gated name match for the 214 picks lacking a placeId, rendering the canonical `IconicPlaceCard` | `ALREADY SOLVED` | `app/guides/[slug]/page.js:94-220,405-411`; `lib/guides.js:11,631`. Commit `c90ba681` (#645). Guards: `check-guide-share.mjs`, `check-guide-deal-cards.mjs`, `test-shell-key-guide-deeplinks.mjs` | None |
| **CreatorFinds** | "One find is worse than none": below a coverage threshold, bridge a thin row to the nearest covered metro rather than show an orphan card | Solved and exceeded. `CREATOR_FINDS_MIN=3`, `bridgeCity()` shipped in `e9a2aa4c` (#636); main then attacked the root cause instead, promoting 200 creator-scouted spots to first-class inventory so most readers never hit the bridge case | `ALREADY SOLVED` | `lib/creatorFinds.js:1-80`; `docs/RANKING_AND_FEATURING_SPEC.md:193-195`; commits `e9a2aa4c`, `039a0241`, `a7bfc116`, `6dc230b4` | None on the logic. **See product flag below** |
| **City unlock** | (a) add `places.photos` to the field mask so unlocked cities are not born photo-less; (b) resolve the new metro's name by reverse-geocoding the coordinates instead of trusting the client's `body.city` label, after `metro='gastonia-nc'` ended up holding 90 Houston TX rows | (a) present and identical. (b) absent | `PARTIALLY SOLVED` | (a) `app/api/city/unlock/route.js:36,203`. (b) `grep -c resolveCityFromCoords` = **0**; main still does `slugify(body.city, lat, lng)` at `:143` and spends Viator on `body.city \|\| cityNorm` at `:233`. Mitigating: main independently closed the client-side root cause via the pairing law, `lib/locationHonesty.js` `centerAgreesWithLabel` (v8.46, same incident, same day) | **Missing delta only**: server-side reverse-geocode as defense in depth (a caller bypassing the app's own state machine still gets a client-trusted label), plus reordering `cityNorm` before `body.city` for Viator spend. Small follow-up PR. Lower urgency now the pairing law ships |
| **Foursquare search** | Foursquare v3 was sunset 2026-05-15 and now answers **429, not 401/403**, so the v3-first / 401-403-fallback logic never reaches the working 2025+ API. Foursquare has contributed **0 results since May**, leaving Google as the only paid general-venue source | Not fixed at either HTTP call site. **But the identical root cause was diagnosed and fixed in a sibling fetcher** and never propagated | `PARTIALLY SOLVED` | Still broken: `app/api/fsq/search/route.js:9,32,35` (v3 first, 401/403 fallback); same stale ordering in `app/api/sources/compare/route.js:49-51`. Already fixed: `lib/popularity.js:146` `key.startsWith("fsq3")` routes on the key prefix, proven by `scripts/test-popularity.mjs:51`. Commit `258d86ea` (#892) | **Missing delta only**: port the proven key-prefix branch from `lib/popularity.js` into `fsqFetch()` and into `sources/compare`. Do NOT port the WIP's dual-probe/memoized version. Tiny mechanical PR, plus a guard modeled on `test-popularity.mjs:51`. Grep repo-wide for `v3/places/search` before closing |
| **Coverage-watch cron** | Watch the symptom "we told a reader a place is covered and the feed cannot fill it". Adds `/api/cron/coverage-watch`, `lib/coverageWatch.js`, a `wf_coverage_audit()` RPC, and shrinks `wf_gate_status`'s radius from 75mi to a `GATE_MILES=20` matching the feed's real ~19.6mi serve radius, requiring >=8 operational rated rows not 1. Root incident: Gastonia NC, 2026-08-23, gate said `live` on 86 rows within 75mi that were all in South Carolina; the feed served 2 | **Does not exist in any form.** `git log --all` shows those paths touched by exactly one commit: today's own snapshot | `STILL MISSING` | Route absent, `lib/coverageWatch.js` absent, 0 hits for `coverage-watch` in `vercel.json`, 0 `wf_coverage_audit` in `supabase/migrations/`. **Notable**: main's `app/api/cron/schema-watch/route.js` refers to coverage-watch as an existing sibling three times (`:3`, `:21`, `:75`) — main's code documents a watchdog that was never built | Worth its own PR, **reimplemented not copied**. Split in two: (1) the `wf_gate_status` radius/min-rows/operational fix on its own — the gate genuinely still overcounts coverage; (2) the cron built on the current watchdog convention (`recordPulse`/`jobCannotRun` from `lib/jobPulse.js`/`lib/jobFail.js`, as schema-watch and job-watch now do), which the WIP version predates. **Nuance**: the user-visible symptom is currently moot — `CityGate` was ordered off the homepage by the owner on 2026-08-18 and the rails never consult `wf_gate_status`. But it still drives the background auto-unlock effect (`app/home.js:8322-8342`), so the data bug is less visible, not gone |

## Useful ideas worth preserving, even though the implementations should not be reused

1. **"Claim vs ground truth" as a watchdog class** — comparing what a gate tells a reader against what the feed can actually serve, as a sibling to `job-watch` and `schema-watch`. Exists nowhere on main under any name, and main's own code already assumes it exists.
2. **Metro-label geographic spread check** (`spread_mi`) — catches a metro slug spanning thousands of miles (the WIP caught `kabol-kabul` at 6,635 mi). Cheap integrity signal, absent from main, valuable independently of whether the full cron ships.
3. **Never trust a client-supplied place label for what gets written to the database.** Good defense in depth alongside the pairing law, not a substitute for it.
4. **Record WHY a manual `METRO_TOWNS` entry maps where it does.** The WIP's own `parrish`/`ruskin` guess was wrong and needed an owner screenshot to catch. An inline rationale plus a test lock at write time would have caught it sooner.
5. **Foursquare `probe=1` per-generation diagnostics** — probing both API generations concurrently and reporting `current`/`legacy`/`serving`/`richData` separately is a better diagnostic shape than main's single-status probe. Worth adopting for the probe endpoint only; the fetch-order fix should still come from `lib/popularity.js`'s simpler proven pattern.

## Product flags for the owner (not WIP items, surfaced by the audit)

- **`CreatorFinds` has no render site anywhere in `app/`.** The coverage bug is fixed, but `BestNearby` (which hosted the shelf via `creatorSlot`) was deliberately unmounted from `/` in the v8.8 daypart-rail redesign. The component is kept alive only by its own smoke test. If "Finds from local creators" is still wanted as a user-facing surface, that is a placement decision, not a rebuild.
- **Foursquare has been contributing nothing since 2026-05-15**, so every general venue search is carried by Google alone. That is both a cost concentration and a coverage-quality question, independent of the code fix.
- The ten expired Summer 2026 guides remain live (already logged in `AUDIT-2026-09-04.md`, finding 4).

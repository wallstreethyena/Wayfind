# Lane A — Live Event Posters: the daily engine (locked spec, 2026-09-16)

Owner decision locked by Gabe. Build to this exactly; do not redesign it.

## Scope of THIS lane
Engine only. No UI, no `lib/rails.js` change, no push, no merge, no migration APPLIED.
The migration ships as a git-tracked file only, per docs/proposals (#1226) — never run
`apply_migration` or touch Supabase from this lane.

## What already exists on main (read before writing anything)
- `app/api/events/route.js` — Ticketmaster fetch, `fromTicketmaster()`, segment calls, spend cap
- `lib/eventPopularity.js` — `eventPopularitySignal()`, PostHog demand map, `demandBoost()`
- `lib/sportsRail.js` — `leagueOf()` league detection from genre/subGenre
- `lib/trendSources/googleTrendsRss.js` — daily trending RSS, currently `geo=US` only
- `lib/posterEvents.js` — `selectPosterEvents()`, existing mode switch (night-out, date-night)
- `lib/dayparts.js` — `siteTodayStr()`, the ONLY date source allowed for eligibility windows
- `app/api/cron/hero-images/route.js` — the pattern to copy: CRON_SECRET gate, per-metro loop,
  `wf_hero_images` upsert on `{surface,key}`. Same shape, same gating idiom.
- `lib/landingCities.js` — `LANDING_CITIES` centroid list

## The locked rule (do not deviate)

Score every candidate event, then pick its image with this exact chain:

1. Run the **attention crop** on the top-scored event's primary image first. This is the
   default because it fills the tile edge to edge, which reads best in a scrolling rail.
2. If the attention check says the subject does not survive the crop window (a wide banner
   shot, a group photo, a graphic-heavy poster), **reject that image** and try the same
   event's other image variants (Ticketmaster ships multiple ratios per event: `16_9`,
   `3_2`, `4_3`).
3. Still failing on every variant, **reject the event** and try the next event down the
   score, repeating steps 1-2.
4. Only when nothing in that day's pool passes, fall back to the **blurred full-bleed**
   version of the best-scoring event's image. This is the LAST RESORT, never the default —
   worse than an edge-to-edge photo, better than a tile that looks broken.
5. **Sports needs this reject/retry chain far more than concerts.** Ticketmaster's own
   sports photography rarely centers the subject (a batter, a specific player, a mascot)
   the way concert photography usually does — do not assume the attention crop and a plain
   center crop will usually agree on sports. Write the scoring/fit code and its tests
   assuming they will often disagree.

Never rank by commission. Cancelled/postponed/offsale events can never win. Trends absence
is a neutral signal, never a penalty (it only boosts when present).

## Files to create

1. **`lib/eventHeroPick.js`**
   - `heroEventScore(event, ctx)` — weights: Trends match up to 0.35 (US-FL feed counts
     double weight vs US-only match), observed demand (PostHog `demandBoost()`) up to 0.25,
     `eventPopularitySignal()` up to 0.20, imminence (0-14 days, sooner higher) up to 0.15,
     on-sale/priced 0.05, home-market bonus (venue within 25mi of metro centroid) 0.05 tie
     break.
   - `pickHeroEvent(events, bucket, ctx)` where bucket is `"sports"` or `"entertainment"`.
   - `sportRailOf(event)` built on the existing `leagueOf()` from `lib/sportsRail.js` plus
     genre, mapping to exactly: baseball, football, soccer, hockey, basketball, more.
   - Entertainment bucket keys, exactly: concerts, comedy, theater, family, more.
   - Never a placeholder score of 0 with no reason; every reject carries a `reason` string.

2. **`lib/posterImageFit.js`**
   - Implements the fit chain above as a pure function `fitPosterImage(candidateImages, {})`
     returning `{ ok: true, variant, cropStrategy: "attention"|"blurred-extend", reason }`
     or `{ ok: false, reason }` per candidate, so the caller can walk the reject/retry chain.
   - Attention check: needs `sharp` (`fit: cover, position: sharp.strategy.attention`),
     cropped to the tile's real ratio `.5625` (9:16, matches the 941×1672 poster asset
     already in the codebase — grep `railMenuCss.js` for the exact ratio constant and use
     that constant, do not hardcode a second copy of it).
   - Reject rules, all must pass or the image is rejected: (a) not a Ticketmaster category
     placeholder — reject any URL path containing `/dam/c/`, accept `/dam/a/`; reject if the
     API payload has a `fallback: true` flag; (b) cropped width ≥ 640px after the 9:16 crop;
     (c) attention/salient mass inside the chosen crop window ≥ 70%; (d) not a text banner —
     high-contrast horizontal-line density in the top or bottom third spanning >60% of width
     fails; (e) mean luminance between 0.12 and 0.85 with a minimum stdev floor.
   - `sharp` runs server-side only (cron route), never imported into any client bundle path —
     confirm this with a guard (see below).
   - Output crop written as avif/webp/jpg at 380w and 760w widths.

3. **`app/api/cron/live-posters/route.js`**
   - `export const runtime = "nodejs"`, `maxDuration`, `dynamic = "force-dynamic"`.
   - `CRON_SECRET` gated exactly like `app/api/cron/hero-images/route.js` — copy that gate
     verbatim, do not reinvent it.
   - Per metro in `LANDING_CITIES` (or the existing hero-images centroid list, whichever is
     the actual source of truth — check both and use the one `hero-images` already reads):
     fetch the TM pool via the *existing* `fromTicketmaster()` path (do not write a second
     Ticketmaster client), fetch Trends (US + the new US-FL feed), score, run the fit chain,
     write the winning row per bucket.
   - Storage: write to `wf_hero_images` using `surface: "live-sports"` / `"live-events"`,
     `key: metro`, reusing the exact upsert shape `hero-images` already uses
     (`onConflict: "surface,key"`) — this avoids a new table and a migration entirely, which
     is the preferred path unless you find a hard reason it does not fit (say so if you do,
     do not silently apply a migration).
   - Log with `jobFail.js` conventions (`jobCannotRun`) matching the rest of the crons.

4. **`app/api/live-posters/route.js`** (read side)
   - `GET` with `lat`/`lng` query params, resolves nearest metro centroid (same distance
     logic `hero-images`/other metro-resolving code already uses — reuse it, don't
     reimplement haversine a second time if it already exists in the repo, grep first),
     reads the two `wf_hero_images` rows, returns them. CDN cache 1 hour
     (`Cache-Control: public, s-maxage=3600, stale-while-revalidate=600` or match whatever
     convention nearby API routes already use — check one and match it).

5. **`scripts/test-event-hero-pick.mjs`**
   - Three fixture images minimum: (a) real event-specific art that should pass the
     attention crop, (b) a Ticketmaster category placeholder that must be rejected on sight
     (`/dam/c/` path), (c) a wide text banner that fails the attention check specifically
     (not the placeholder check) so the two rejection paths are provably distinct.
   - A sports fixture and a concert fixture proving the scoring, so the "sports needs the
     retry chain more" claim in the spec is actually asserted by a test, not just narrated.
   - A cancelled/postponed event fixture proving it can never win regardless of score.
   - Follow the existing test script conventions in `scripts/test-*.mjs` — read two of them
     first (e.g. `scripts/test-poster-events.mjs`, `scripts/test-sports-rail.mjs`) and match
     their harness style exactly, do not invent a new test runner pattern.

6. **`scripts/check-live-event-posters.mjs`** (a guard, added to `run-guards.mjs`)
   - Pins: `sharp` never appears in any client-bundled file (grep the client component tree);
     cancelled/postponed/offsale can never be the hero (assert via the fixtures above); sport
     rail keys are exactly baseball/football/soccer/hockey/basketball/more and entertainment
     keys are exactly concerts/comedy/theater/family/more; every stored image URL points at
     Supabase Storage or the original Ticketmaster CDN, never a raw unvalidated string.

## Explicitly NOT in this lane
- No `lib/rails.js` edit. No `DaypartRail.js` edit. No `app/home.js` edit.
- No Supabase migration applied. If a genuinely new table turns out to be unavoidable,
  write the migration file under `supabase/migrations/` and STOP — flag it in your summary,
  do not run it.
- No push, no PR opened, no merge. Commit locally on `feat/live-event-posters` only.

## Definition of done for this lane
1. `node scripts/run-guards.mjs` green (uses whatever placeholder env AGENTS.md §4 specifies).
2. `npm run check:jsx` green.
3. `npx next build` green.
4. `node scripts/test-event-hero-pick.mjs` green, and it actually red-then-green proves the
   reject/retry chain (show a run where a rigged "always fails attention" candidate correctly
   falls through to the next event, and a run where nothing passes correctly falls through to
   the blurred-extend fallback).
5. A short written summary at the end: what changed, why, risks, follow-ups (Lane B / UI
   wiring depends on the exact shapes you export from `eventHeroPick.js` and
   `posterImageFit.js` — document those shapes clearly at the top of each file for Lane B to
   consume).

Work only inside this worktree (`~/Projects/wf-live-posters`, branch `feat/live-event-posters`).
Read `AGENTS.md` and `CLAUDE.md` in full before writing any code — they win over this document
if the two ever conflict on process (not on the product rule above, which is locked).

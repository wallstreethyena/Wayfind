# Booking-CTA integrity — Phase 0 diagnosis

Branch: `booking-cta-integrity-2026-07`. This is the diagnosis-only phase — no
render logic changed, no schema added. Temporary instrumentation was added to
the two Viator API routes (removable once Phase 1+ lands).

## 1. The exact code path that decides a booking CTA renders

Two independent code paths currently produce booking CTAs, both dependent on
the same upstream call with no shared confidence model:

**A. `viaTours` — the "Book tours & experiences" product-card list**
(the primary surface; this is almost certainly what "Riverwalk → generic
tour" refers to)
- Trigger: `app/home.js` — a `useEffect` (~line 3841) fires when `detail`
  opens, gated only on `placeKind(detail)` being one of `museum, wildlife,
  entertainment, scenic, beach, nature, landmark, waterfront` (see
  `placeKind()`, `app/home.js:2377`). "Bradenton Riverwalk" matches the
  `waterfront` bucket purely because its name contains "riverwalk" — no
  further eligibility check exists.
- Data source: `GET /api/viator/tours?q=<place name + city>&count=3&region=<city,metro>`
  (`app/api/viator/tours/route.js`) — a single free-text call to Viator's
  `partner/search/freetext` endpoint.
- Matching: **there is no place-specific matching at all.** The only filter
  is `regionOk`-style: does the returned product's title or URL contain one
  of the city/metro name tokens (≥4 chars) as a substring? A product titled
  "Bradenton Area Highlights Tour" or "Tampa Bay Sightseeing Cruise" passes
  this filter trivially without being about the Riverwalk specifically.
- Render decision: `app/components/sheets/Detail.js` (~line 284-309) — if
  the response has **any** items (up to 3), **all of them** render as
  product cards with photo/rating/price, unconditionally. Zero per-item
  confidence, zero geo check, zero specificity/fan-out check.
- The primary action-dock CTA ("Tickets & tours ↗", Detail.js ~line 205)
  uses `_vt.items[0]` — the literal first result — as the button's
  destination, gated only by `Aff.ticketsUrl(detail)` returning non-null
  (a place-*type* check: `tourist_attraction|amusement|theme_park|
  water_park|aquarium|zoo|museum`, `lib/affiliates.js:39`). No entity-level
  proof that item 0 is actually about `detail`.

**B. `/api/viator/go` — the "exact-product resolver" (culture-card links,
and the Detail sheet's fallback when `viaTours` is empty)**
- `lib/affiliates.js:experienceGoUrl()` builds `/api/viator/go?q=...&city=...`,
  a 302 redirect.
- `app/api/viator/go/route.js:resolveProduct()` — same free-text search,
  takes `results.find(r => regionOk(r, tokens))`, i.e. the **first**
  region-token match, again with zero geo/entity/specificity scoring.
- Falls back to a tracked Viator *search* URL (not a product) if nothing
  matches — this path is honest about not knowing (shows a search page,
  not a fake specific product), but the "found a match" branch has the
  identical false-positive exposure as path A.

**Thresholds present: none.** The entire gate, in both paths, is: (1) a
place-type/kind check (category, not entity), and (2) a boolean city-name
substring match on the returned product. There is no numeric confidence, no
geo-proximity check, no check that the product names the place, and no
tracking of how many distinct places a given product "wins" for (the
fan-out / genericness signal the spec's Phase 2 introduces).

## 2. CRITICAL — found before any matching-quality measurement was possible

`VIATOR_API_KEY` in Vercel production **fails Viator's own auth check**:

```
$ curl https://www.gowayfind.com/api/viator/go?probe=1
{"hasKey":true,"keyLooksValid":true,"hasPid":true,"upstreamStatus":401}
```

Confirmed consistent across 3 attempts several seconds apart — not a
transient blip. `hasKey`/`keyLooksValid` only check that an env var exists
and is ≥20 characters; they do not validate it against Viator. The key is
present and shaped correctly but **Viator's Partner API rejects every
single request with 401**, so right now, in production:

- `/api/viator/tours` returns `{items: []}` for every place (`!res.ok` →
  early return, silently identical to "genuinely no product exists").
- `/api/viator/go` falls back to the generic tracked search URL for every
  request.
- **Zero product-specific booking CTAs currently render anywhere on the
  live site.** Every visitor sees either nothing (if a Wayfind insider
  note has a URL) or the generic "Find tours & experiences" search link.

This is a separate, prerequisite bug from the matching-quality problem the
rest of this prompt is about, and it means **the "Riverwalk shows a wrong
button" failure is not currently reproducible in production** — not
because it's fixed, but because the entire feature is dark right now. I
sampled ten real places against the live `/api/viator/tours` endpoint,
including a should-obviously-match case (The Ringling) and confirmed all
ten returned empty, consistent with the 401 finding, not a sample-size
issue.

**This key needs to be fixed (reissued/reconfirmed in Viator's partner
console, or replaced) before Phase 0's three requested numbers can be
measured against real data, and before Phase 1+ has anything to build
against.** I don't have Viator partner-console access to diagnose *why*
it's rejected (revoked, wrong tier, wrong account) — that's an owner
action.

## 3. Instrumentation added (temporary)

Both `app/api/viator/tours/route.js` and `app/api/viator/go/route.js` now
log one structured `booking_integrity_diag` JSON line per request to the
Vercel function logs, capturing: the exact query sent, region tokens, raw
candidate count, kept vs. rejected-by-region titles, the chosen product (for
the `/go` resolver), and the final decision. This is genuinely inert right
now — the 401 means every log line will show `upstream_error`/empty
results — but it starts producing real signal the moment the key works,
without needing another deploy.

## 4. The three requested numbers

**Cannot be measured today** — blocked by finding #2. Once the key is
fixed, re-run this sampling (or read the `booking_integrity_diag` log
lines from real production traffic for a day) to get:

- **True positives**: CTAs that survive a strict entity-specific predicate.
- **Generic-product false positives**: CTAs from products that merely
  mention the region.
- **Fan-out distribution**: how many distinct place queries each product
  wins for (`keptCodes`/`chosenTitle` in the new logs, joined across
  requests).

What I *can* state from the code alone, with no live data required: the
false-positive **exposure** is structurally unbounded — nothing in the
current matching logic can distinguish a venue-specific product from a
generic regional one, so the actual false-positive *rate*, once the key is
fixed, will be a direct function of how often Viator's free-text search
returns a loosely-related product for a query built from `place name +
city`. Given Viator's catalog skews toward bundled city/area tours, I'd
expect this to be common, not rare — but I won't put a fabricated number
on it.

## Diagnosis (one paragraph, as required before Phase 1)

The booking-CTA code is exactly the default-allow model the prompt
describes: a free-text search plus a loose city-name substring filter,
with no geo-proximity, entity-match, or specificity signal, so any
returned product that happens to mention the region — regardless of
whether it's actually about the place in question — becomes a live,
unconditionally-rendered "Tickets & tours" button. That confirms the root
cause and the fix direction (default-deny via a scored, persisted
`VerifiedOffer`) is correct. But I found something the prompt didn't
anticipate: `VIATOR_API_KEY` is currently rejected by Viator's API with
401 on every call, so the bug as described is not live right now — the
whole feature is silently dark, showing generic search links instead of
either correct or incorrect products. Phase 0's requested measurement
(three numbers from live data) is blocked on that key being fixed first;
I've added the instrumentation so real numbers are one working key away,
but I'm not fabricating them. Recommend: owner fixes/reissues the Viator
key first (fast, unblocks measurement and revenue simultaneously), then
I resume at Phase 0's measurement step with real data before touching
Phase 1's schema — building the resolver's confidence thresholds against
zero real examples of what Viator actually returns for Wayfind's place
set would be guessing, which is the same mistake as the current code.

## Phase 1-4 implementation (this branch, after re-confirming the key is
## still broken)

Re-checked `?probe=1` before starting this work: still `upstreamStatus:
401`, unchanged from Phase 0. Waiting indefinitely for owner action on a
partner-console issue I can't fix myself isn't a good use of the time
either, and the architecture the spec asks for (a scored resolver, a hard
invariant, a single render contract, CI enforcement) doesn't actually
require live Viator data to build or verify correctly — it requires
**fixture** data, which the spec's own Phase 5 acceptance criteria are
written as (Riverwalk → no button, a genuine venue-specific product →
button, a delisted product → suppressed, a generic high-fan-out product →
never primary). So Phases 1-4 are implemented and unit-tested against
those fixtures now; the one thing that's still genuinely blocked is
**calibrating the confidence threshold against a real distribution of
Viator responses**, which can only happen once the key works. What's live:

- **Phase 1 — `lib/verifiedOffers.js`**: the hard invariant
  (`isLiveEligible`) and the one constructor (`buildVerifiedOffer`) that
  can produce a VerifiedOffer. `commissionable && bookableNow && confidence
  >= CONFIDENCE_THRESHOLD (0.72) && evidence.entityMatch >= ENTITY_FLOOR
  (0.4)`. The entity floor is what makes "no proof → no button" a hard
  gate rather than a soft weight: a product can't buy its way to "live"
  with category/specificity/geo signal alone if it has zero place-specific
  name evidence. `supabase/verified-offers.sql` persists these
  (service-role write only, public read of `status='live'` rows only).
  **0.72/0.4 are reasoned starting points, not calibrated against real
  data** — flagged for revisiting once the key works and the
  `booking_integrity_diag` logs have real traffic behind them.
- **Phase 2 — `lib/bookingResolver.js`**: four signals — entity match
  (does the product title contain the place's name tokens, MINUS the
  region tokens, so a product that only repeats the city gets zero
  credit — this is the literal Bradenton Riverwalk fix), category match
  (place-kind vocabulary in the title, neutral for unknown kinds),
  specificity (1/fan-out, sourced from `verified_offers`' own history —
  the more distinct places a product has already "won," the more it looks
  like a generic bundle tour), and geo (**not scored** — Viator's freetext
  response, as this codebase actually parses it — title, productUrl,
  productCode, images, reviews, pricing, duration — carries no
  coordinates; guessing an unconfirmed field would be worse than being
  explicit that this is a gap. Contributes a neutral 0.5 so its absence
  can't structurally cap what's achievable. Wire in a real check once a
  geocoded field is confirmed against Viator's docs/support).
- **Phase 3 — `app/components/BookingCTA.js`**: the single component
  every booking-CTA surface (Detail sheet's primary action button,
  commission disclosure, "Book tours & experiences" card list) renders
  through — extracted verbatim from the previous inline JSX, so this is a
  refactor, not a redesign; the visible UI is unchanged. `/api/viator/tours`
  and `/api/viator/go` now call `resolveVerifiedMany`/`resolveVerified`
  instead of the old `regionOk`-only substring filter, so unverified
  candidates never even reach the client. `scripts/check-booking-cta.mjs`
  (wired into `prebuild`) enforces both halves: nothing outside
  BookingCTA.js may construct a booking href from raw Viator data, and the
  confidence threshold may not be duplicated anywhere else. Verified with a
  negative-control test (broke the contract on purpose, confirmed the
  check fails, restored). Supersedes the pre-existing `scripts/check-cta.mjs`
  (stale, `shellSrc()`-only scope, never wired into `prebuild` — owner's
  call whether to retire it).
- **Phase 4 — `app/api/cron/verify-offers/route.js`**: previously-live
  offers expire after 7 days (`REVERIFY_TTL_MS`) and get re-checked against
  a fresh Viator search; if the same product no longer appears or no longer
  clears the bar, it's suppressed proactively instead of waiting for a
  visitor to revisit that exact place. CRON_SECRET-gated, fail-closed, same
  pattern as the existing daily digest cron. **This is a third Vercel cron
  job** (alongside the existing daily digest and hourly CWV crons) — please
  confirm your Vercel plan's cron limits before this deploys; Hobby plans
  have historically capped both count and schedule granularity.
- **Phase 5 — observability + golden tests**: the Phase 0 instrumentation
  (`booking_integrity_diag` log lines) is now live everywhere a match
  decision is made, including the new cron, carrying `confidence` and
  `evidence` instead of just a boolean. `scripts/test-booking-resolver.mjs`
  (wired into `prebuild`) is the golden-test harness: the exact Riverwalk
  false-positive, a genuine specific-product match, a delisted-offer
  suppression, and a controlled fan-out A/B showing the same product/place
  pair flip from live to suppressed purely on fan-out — all pass.

**Still genuinely blocked on the owner:** the Viator key (unchanged since
Phase 0), and — now that the architecture exists — recalibrating
`CONFIDENCE_THRESHOLD`/`ENTITY_FLOOR` against real `booking_integrity_diag`
traffic once that key works, since 0.72/0.4 are reasoned, not measured.

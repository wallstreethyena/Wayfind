# Events pipeline — Phase 0 diagnosis

Branch: `events-pipeline-integrity-2026-07`. Diagnosis only — no product
change in this phase. Measured against live production
(`POST https://www.gowayfind.com/api/events`) on 2026-07-11 with two
probes: Parrish, FL (home market) and Orlando, FL.

## 1. Pipeline map

**Providers** (all in `app/api/events/route.js`, one aggregator route):

| Provider | Env gate | Configured in prod today? | Destination URL it emits |
|---|---|---|---|
| Ticketmaster (7 parallel segment calls) | `TICKETMASTER_API_KEY` | YES | `e.url` (always present in practice) |
| SeatGeek | `SEATGEEK_CLIENT_ID` | no | `e.url` |
| PredictHQ | `PREDICTHQ_TOKEN` | no | **a `google.com/search?q=` URL, fabricated in code** (route.js:171) |
| Bandsintown | `BANDSINTOWN_PARTNER_KEY` | no | `ticket_url \|\| event_url \|\| ""` (can be empty) |
| SerpAPI Google Events | `SERPAPI_KEY` | configured but returned 0 | `e.link` or a ticket link (can be empty) |
| OpenWebNinja | `OPENWEBNINJA_KEY` | no | same shape as Serp (can be empty) |
| Manatee LibCal iCal | keyless, geo-fenced | YES | event URL, falls back to the library calendar homepage |
| Eventbrite (org-scoped) | `EVENTBRITE_PRIVATE_TOKEN` + org ids | no | `e.url` |
| Local staples (curated, in code) | keyless, geo-fenced | YES | hardcoded venue sites (frrm.org etc. — pre-existing curated data, facts from venue materials) |

Aggregation: `Promise.all` (no per-provider timeout — a hanging provider
stalls the whole response until fetch's own default timeout), fail-soft
per provider (`catch -> []`, indistinguishable from "provider had no
events"; **no provider health/latency logging exists**). Then `dedupe()`
on **normalized-name + date only** (route.js:322) — venue is NOT in the
key, so two different same-named events on the same day at different
venues collapse wrongly, and the same event twice on one day at one venue
(matinee/evening) also collapses. Then a geo/state filter, then sort,
then `.slice(0, 250)`.

Cancelled events: **Ticketmaster's `dates.status.code`
(cancelled/postponed) is never read** — grep confirms no status handling
anywhere in the route. Cancelled TM events stay listed in the Discovery
API, so they flow straight into cards. (Not countable from the live probe
because the normalized shape discards the field — that's part of the
problem.) Only LibCal filters `^cancelled` titles.

The separate `app/api/ticketmaster/route.js` has **zero callers**
anywhere in app/ or lib/ — dead code from before the aggregator.

**Client state** (`app/home.js`): `loadEvents()` (~line 3984) → `events`
state; `loadVenueEvents(p)` (~3940) → Detail-sheet venue events (radius
2mi, and when venue-name matching fails it **falls back to showing ALL
nearby events** labeled "at or near this location");
For-You strip fetch (~4855) → `foryouEvents` + `libraryEvents`.
`eventCounts` (set from the API's `counts`) is **dead state — set, never
rendered**; the API's `counts` are raw pre-dedup provider totals anyway
(the live probe returned `Ticketmaster: 346` while only 222 TM events
survived to the feed).

**Cache layers**: 10-min in-memory TM cache (per warm instance) in the
route; no client-side cache; no HTTP caching (POST).

**Render surfaces** (complete inventory):
1. **Events screen** (`app/components/screens/Events.js`) — 2-col card
   grid + date chips + category chips.
2. **For You / homepage** (`app/home.js` ~5976) — featured hero + a
   horizontal rail ("Happening near you"), plus the Community tile sheet
   grid (~6090, "Events nearby") using `libraryEvents`/`foryouEvents`.
3. **Map screen, events mode** (`Map.js` + `MapView.js`) — purple venue
   pins → `eventPreview` bottom card.
4. **Detail sheet** (`Detail.js` ~522) — "Events at this venue"
   accordion (`venueEvents`).
5. Search results do NOT surface events (place search only) — verified;
   the `keyword` param of `/api/events` has no live caller.

## 2. The no-op / wrong-destination click inventory

- **Events screen card (`EventCard`)**: the title, image, and body are
  **not interactive at all** — there is no card-level destination. The
  only actions are a small venue `<button>` (async Google `findPlace`,
  which can fail → toast "Could not find this venue" → dead end) and a
  small "Get tickets ↗"/"View details ↗" text `<a>` shown only when
  `e.url` is non-empty. A user tapping the card/title/image — the natural
  gesture — gets nothing, on every event, always. This is the headline
  no-op, and it's the opposite failure from a broken href: the affordance
  looks like a card but has no primary destination wired.
- **Homepage hero + rail + community grid**: whole-card `div onClick`
  (not semantic links; no keyboard access) whose destination is
  `openVenue(e)` — a runtime Google Places text lookup that can and does
  fail (toast, no navigation). The event's own URL is only reachable via
  the hero's nested "Get tickets" pseudo-button.
- **Map event preview card**: same `openVenue` dependency.
- **Detail venue-events rows**: `<a href={e.url}>` with **no guard** — an
  empty `url` renders `href=""` (self-navigation no-op). All TM events
  have URLs today, so this is latent, not live.
- **PredictHQ** (when configured): every event's destination is a
  fabricated Google-search URL — the exact anti-pattern this spec bans.
  Latent today (no token in prod), live the day someone adds one.

## 3. Displayed vs usable — the measurements

Live probes (radius 60mi):

| | Parrish | Orlando |
|---|---|---|
| Displayed (API feed) | 250 (capped by slice) | 250 (capped) |
| Per source | TM 222 · LibCal 19 · staples 9 | TM 250 |
| Empty/missing URL | 0 | 0 |
| Google-search URL | 0 | 0 |
| Past-dated | 0 | 0 |
| Residual dupes (title+venue+start key) | 0 | 0 |
| **Usable by URL/date/dedup measures** | **250** | **250** |

**The honest reading:** with only Ticketmaster + LibCal + staples
configured, the *data* arriving today is clean — every event carries a
real URL, dates are future, and cross-provider dupes don't exist because
there's effectively one major provider. The damage today is **not** in
the data; it is (a) **in the interaction layer** — the primary tap target
on every card either doesn't exist (Events screen) or routes through a
fallible venue lookup instead of the event's own destination (homepage,
map); (b) **in the counts** — the date-chip and "All" counts are computed
on the pre-collapse list while the grid renders the post-collapse list
(`dedupeEvents` merges recurring events), so the chip number routinely
exceeds the rendered cards; the API's `counts` field is raw pre-dedup
totals (346 vs 222 actually served); and (c) **structural** — zero
cancelled-status handling, a fabricated-search-URL provider, empty-URL
providers, no per-provider timeout, no health logging, and a
name+date-only dedup key are all latent failures that go live the moment
more providers get keys (several are one env var away).

**Routing** (Phase 3 scope, confirmed): `/events` →
`GoScreen` → `window.location.replace("/?go=events")` → home consumes
`go` and `history.replaceState` strips it → **the address bar shows `/`
while the Events view displays**. Refresh lands on the default screen,
Back/Forward don't traverse Events state, no event has a shareable URL,
and no internal event detail page exists (destination precedence
currently ends at external URLs). The audit prompt's Phase 5 URL scheme
(`/events/[city]/...`) is **not built** — `/events` is a thin noindexed
bridge page — so per the scope rule, Phase 3 here implements that scheme
rather than forking one.

## 4. Diagnosis (one paragraph, before building)

The events pipeline's data layer is in better shape than the symptom
suggests — with today's providers, essentially every event arrives with a
real destination URL, future date, and no cross-provider duplicates — but
the interaction layer throws that away: the Events-screen card's natural
tap target (title/image/body) is wired to nothing, and every other
surface routes the primary tap through a fallible runtime venue lookup
(`openVenue` → Google findPlace → "Could not find this venue") instead of
the validated destination the event already carries, which is exactly the
"click does nothing" trust-killer. Meanwhile the displayed counts are
computed on a different list than the rendered cards (pre- vs
post-recurrence-collapse, and raw pre-dedup provider totals in the API),
so the number a user sees never has to match the cards they get; and the
pipeline has five latent default-allow failures — no cancelled-status
check, a provider that fabricates Google-search URLs, providers that can
emit empty URLs unguarded, no per-provider timeout, and a dedup key that
ignores venue — each one env-var away from going live. The fix is the
same default-deny inversion as the booking-CTA work: a single normalized
event contract validated at the provider boundary, a destination resolved
(internal page > official URL > ticket URL) at normalization time as a
render precondition, counts computed only from the post-validation list,
and card semantics where the whole card is one real link. No blocker
found: all four phases can be built and tested against fixtures plus the
live Ticketmaster feed that already works.

## 5. What Phase 1-4 must not break (verified working today)

- TM affiliate param (`ticketUrl()` in home.js appends
  `AFFIL.ticketmasterParam`) — preserve on every external ticket link.
- LibCal curation (routine-program filter) and the geo-fences on civic
  sources.
- The recurrence collapse UX (`dedupeEvents` + `recurrenceLabel`) — users
  should still see "Sat & Sun · 6 dates", but the counts must be computed
  on the same collapsed list the grid renders.
- `logEvent` analytics on event taps (fire-and-forget already).
- The `events_none` telemetry signal in `loadEvents`.

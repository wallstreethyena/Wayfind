# Events outing intelligence — the before/after picker

- **Module:** `lib/eventOuting.js`
- **Guard:** `scripts/check-event-outing.mjs`
- **Owner rule (2026-09-22):** every event page recommends places for
  **before and after that specific event, based on what people actually do**
  — never a generic top-rated list near the venue.
- **Used by:** `lib/eventPairings.js` (every event surface reads picks
  through it — `/events/[city]/[slug]`, `/florida-events/[slug]`, and any
  guide with an `eventMap`), so a change here reaches every event page at
  once.

## The problem this replaces

Before this change, "Nearby places" on an event page was a straightforward
governed-score sort of everything owned-inventory nearby, capped and
floor-gated. That answered the wrong question. A reader at a symphony page
does not want the same shelf of best-reviewed restaurants a reader at a food
festival page gets — a symphony reader wants **dinner before the curtain and
dessert or a quiet drink after**; a food-festival reader already ate, and
wants **coffee or something sweet on the way out**, never another
restaurant. A single top-rated sort cannot tell those two readers apart, so
it served both the same list.

## The rule

1. **Classify the event.** `classifyEvent(event)` reads whatever fields the
   caller has — live provider fields (`name`, `date`, `time`, `segment`,
   `genre`) or curated fields (`event_name`, `category`, `subcategory`,
   `tags`, `audience`, `minimum_age`, `start_date`, `end_date`,
   `start_time`) — and returns:

   ```js
   { archetype, daypart, allDay, family, adult, alreadyFed }
   ```

   - **daypart** — `morning` (< 11:00), `day` (< 16:00), `evening`
     (< 20:00), `late` (>= 20:00). Missing a time falls back to the event's
     shape: a multi-day spread or a festival/market row is `allDay`;
     otherwise Music/Arts/Sports/Comedy lean `evening` and everything else
     (Family/Community, unknown) lands on `day` — the safe generic default.
   - **family** — segment `Family`, an audience tag mentioning
     family/kids, a family-shaped subcategory (`family-*`,
     `pumpkin-patch`, `holiday-lights`, `parade`, `kids`), or a name/genre
     match (`kids`, `children`, `family`, `disney on ice`, `sesame`,
     `paw patrol`).
   - **adult** — `minimum_age >= 18`, a genre match
     (hip-hop/EDM/electronic/dance/club/bar-crawl), or a `21+` tag.
   - **alreadyFed** — the event's whole premise is eating/drinking (a food
     category, a food/wine/beer/seafood festival, a bar crawl, a market).
     This **inverts** the model: no restaurant slot exists for these
     archetypes at all.
   - **archetype** — the specific SLOT_TABLE key this event resolves to
     (below), decided in this order: comedy → sports → already-fed →
     theater/classical → family → all-day festival → club/country/concert →
     generic.

2. **Slot real candidates into before/after picks.**
   `fillOutingSlots(ctx, candidates, { max, min })` takes the SAME merged,
   already-scored, already-distanced candidate pool `lib/eventPairings.js`
   always used (still `buildNearbyPool` over `wf_inventory` — nothing here
   invents a place or a score) and fills the archetype's slots.

3. **Never a thin shelf, never a lie about hours.** Below the floor (default
   `min: 3`) the caller renders nothing, same as before. Nothing in this
   module may ever say "open late", "open now", or reference hours —
   `wf_inventory` carries none, so the judgment here is entirely about the
   **event's** schedule, never a claim about the **place's**.

## The archetype → slot table

Each archetype is an ordered list of slots. A slot names: a `timing`
(`before`/`after`), Google `primary`/`any` types it matches, an `exclude`
list, a `maxMi`, and a `quota` (max picks from that slot). Slot labels are
plain, reader-facing sentences — **no dashes**, per the owner's house style;
`scripts/check-event-outing.mjs` greps for it.

| Archetype | When | Slots (timing · label) |
|---|---|---|
| `concert_evening` | Music segment, not country/club/theater | before · Dinner before the show, Drinks before — after · Late night bites, Nightcap |
| `show_classy` | theatre/musical/ballet/opera/symphony, evening | before · Dinner before the show, Wine before — after · Dessert after, A quiet drink after |
| `show_matinee` | same genre signal, morning/day | before · Lunch before the show, Coffee before — after · Early dinner after, Dessert after |
| `club_night` | adult + hip-hop/EDM/electronic/dance/club genre | before · Lounge before, Quick bite before — after · After hours, Late night food |
| `country_jam` | country/jam/reggae/bluegrass/folk/americana genre | before · Casual bite before, Pregame drinks — after · Casual bar after, Late night bites |
| `comedy` | comedy segment/genre/name | before · Dinner before the show — after · Drinks after, Late night food |
| `sports_day` | Sports segment (or " vs " name pattern), daypart day/morning | before · Brunch before, Sports bar before — after · Early dinner after, Ice cream after |
| `sports_night` | Sports, daypart evening/late | before · Dinner before the game, Sports bar before — after · Bar after, Late night food |
| `festival_allday` | multi-day or festival/market-shaped, not already-fed | before · Coffee before the gates, Breakfast before — after · Quick bite after, Dessert after |
| `festival_fed` | food category, food/wine/beer festival, bar crawl, market | after only · Coffee after, Dessert after, A low key wine bar after (adult only), Bakery after |
| `family_day` | family signal, daypart morning/day/allDay | before · Lunch before, Breakfast before — after · Ice cream after, Park time after |
| `family_evening` | family signal, daypart evening/late | before · Dinner before — after · Ice cream after, Dessert cafe after |
| `generic_evening` | no stronger signal, daypart evening/late | before · Dinner before, Drinks before — after · Dessert after, Nightcap |
| `generic_day` | no stronger signal, daypart morning/day | before · Lunch before, Coffee before — after · Dinner after, Dessert after |

Rail copy (`outingCopy(archetype)`) pairs a title with each family of
archetypes — "Make a night of it" for concerts/club/country, "Dinner and a
show" for theater, "Game day, sorted" for sports, "Before and after, kid
friendly" for family, "After you've had your fill" for already-fed
festivals, "Before the gates, after the encore" for all-day festivals,
"Dinner, laughs, drinks" for comedy, "Make an outing of it" for the generic
fallback — with one shared note: *"Picks for before and after, ranked by
Wayfind Score and walking distance."*

## Scoring

For a candidate `c` against a slot `s` (only when `c.distMi <= effectiveMaxMi`):

```
fit   = 1     if c.primaryType is in s.primary
        0.6   if any of c.types[] (or c.primaryType) is in s.primary ∪ s.any
        0     otherwise (ineligible for this slot)

score = 0.55 * (c.governed_score / 100)
      + 0.30 * clamp(1 - c.distMi / effectiveMaxMi, 0, 1) ^ 1.5
      + 0.15 * fit
```

Fill order, per event:

1. **Pass 1 — round robin.** Walk the slot table in order; take the single
   best-scoring eligible candidate for each slot.
2. **Pass 2 — fill to `max`.** Add remaining candidates by score, honoring
   each slot's `quota`.
3. **Pass 3 — suburban widen.** If still under `min`, redo passes 1–2 with
   every slot's `maxMi` doubled (capped at 12 miles overall) — an
   amphitheater or speedway with little truly walkable nearby still gets a
   real answer, just fewer, further picks.
4. **Pass 4 — overflow.** If still under `min`, admit remaining candidates
   by governed score + distance under the label "Also nearby", up to the 12
   mile cap.

Two caps apply throughout: **no more than 3 picks share the same
`primaryType`** (so five near-identical steakhouses can't crowd out
everything else), and results are **deduplicated by id** with deterministic
tie-breaks (score, then distance, then id) — the same event and candidate
pool always produce the same order.

Final order: every "before" pick, then every "after" pick, each group
ranked by score. Each row is stamped:

```js
row.outing = { archetype, slotKey, slotLabel, timing, railTitle, railNote };
row.rankingNote = `${slotLabel} · ${distMi.toFixed(1)} mi from the venue`;
```

## What is excluded, and why

**AVOID** (every archetype except `family_day`): `tour_agency`,
`travel_agency`, `boat_tour_agency`, `spa`, `gym`, `fitness_center`,
`yoga_studio`, `wellness_center`, `museum`, `art_museum`,
`tourist_attraction`, `marina`, `dog_park`, `hotel`, `lodging`,
`adult_entertainment`, `event_venue`, `concert_hall`,
`performing_arts_theater`. A second event venue is not a before/after stop,
and none of these read as "worth going to on the way" for the events this
module covers — even a very highly rated one (the guard fixture deliberately
gives its tour-agency decoy the single highest score in the pool, 4.95
stars, so a regression that let it through would be obvious, not buried).

**`family_day`** drops `museum` from AVOID — a family destination's own
museum is a real family stop — but keeps everything else, and **every
family archetype additionally excludes every alcohol-adjacent type** (bar,
pub, brewery, wine bar, cocktail bar, night club, lounge, sports bar,
liquor store, adult entertainment), whatever a slot's own `exclude` says.

**`festival_fed`** excludes every restaurant/meal type outright — the
event's whole premise is eating, so there is no "dinner before" slot to
begin with, and the exclusion holds even in Pass 4 overflow.

**`show_classy`** excludes `night_club` and `fast_food_restaurant` — neither
matches a pre-theater dinner or a post-curtain quiet drink.

**A structural note on Pass 4:** overflow has no slot to check a candidate
against, so a slot-level `exclude` (like `show_classy`'s night-club veto)
would otherwise only hold for Passes 1–3 and quietly leak back in as "Also
nearby". `fillOutingSlots` closes this by folding every ACTIVE slot's own
`exclude` list into the effective avoid set used by overflow, in production,
always — the exclusion guards run everywhere the promise is made, not just
the direct-fit path. `scripts/check-event-outing.mjs` red-proves this
exact gap (a lone night club that would otherwise leak into a symphony
page's "Also nearby" shelf).

## The honesty rules

1. **No hours claims, anywhere.** `wf_inventory` carries no open/close
   data. Nothing in `SLOT_TABLE`, `outingCopy`, or a stamped row may say
   "open late", "open now", or "hours" — the guard scans the module's real
   fixture output for exactly this.
2. **No invented places or scores.** Every row is a row `fillOutingSlots`
   was handed; nothing here manufactures a place, a rating, or a governed
   score. The `visibleScore`/`governed_score` stamp in
   `lib/eventPairings.js` is unchanged from before this feature.
3. **No dashes in reader-facing copy** (owner house style). Every
   `SLOT_TABLE` label and every `outingCopy` string is checked against
   `-`, `–` (–), `—` (—).
4. **Never a thin shelf.** The floor (`min`, default 3) still gates the
   whole feature — an event with little owned inventory nearby renders no
   section at all, same as before this change.

## Caching

`lib/eventPairingsCache.js` (`EVENT_PAIRINGS_CACHE_KEY = "event-pairings-v3"`)
calls `classifyEvent(event)` **outside** the `unstable_cache` boundary and
passes the JSON-serialized result in as an extra cache-key argument. This is
what makes a concert and a food festival at the exact same venue coordinates
land in **separate** Data Cache entries — without it, whichever event asked
first would silently serve its picks to the other. The curated page
(`/florida-events/[slug]`) and any guide with an `eventMap` already went
through `cachedEventPairings`; the live event page
(`/events/[city]/[slug]`) calls `eventPairings` directly (it was never
cached, `cache: "no-store"` reads current inventory), and now passes
`name`/`date`/`time`/`segment`/`genre` so it classifies correctly there too.

## How to add a new archetype

1. Add a case to `resolveArchetype()` in `lib/eventOuting.js` that returns
   the new archetype's key — keep the ordering rule (more specific
   archetypes are checked first; the generic fallback stays last).
2. Add an entry to `SLOT_TABLE` keyed by that same string: an ordered array
   of `{ key, label, timing, primary, any, exclude, maxMi, quota }`. Reuse
   the existing shared type lists (`DINNER_PRIMARY`, `PREGAME_BAR_ANY`,
   `SWEET_PRIMARY`, …) where the slot's meaning matches one already defined
   — do not fork a near-duplicate list.
3. Add an entry to `OUTING_COPY` with a `railTitle` (no dashes).
4. Add the new archetype to `scripts/check-event-outing.mjs`'s executed
   fixtures: at minimum, prove it classifies from a realistic event shape,
   prove its slots fill against the shared downtown fixture, and prove
   anything it specifically excludes (or specifically admits, like
   `club_night`'s night club) actually behaves that way — by RUNNING
   `fillOutingSlots`, never by reading `SLOT_TABLE` source.
5. If the new archetype introduces a genuinely new excluded type (not
   already in `AVOID` or an existing `ALCOHOL_EXCLUDE`/`MEAL_EXCLUDE`-style
   list), remember Pass 4 folds every active slot's `exclude` into the
   overflow avoid set automatically — you do not need to hand-maintain a
   second avoid list for the new archetype.

## Research sources

The archetype/slot judgment calls above are grounded in, not invented from:
Resy's Theater District dining guide (blog.resy.com/2025/07/theater-district-dining/);
stageandstreetnyc.com's pre-theater timing guidance; OpenTable's Broadway
landmark page; Broadway League research reports; madisoncomedy.com's FAQ;
atVenu's 2025 Fan Spending Report; Eventbrite trends; alcohol.org on
tailgating; ABC News's sporting-events study; Georgia State University's
2024 tailgating research; Visit Dallas's SMU gameday guide; the Detroit
game-day bar guide; the Columbus arena gameday guide; Sonesta's MLB
game-day ritual piece; CBS Boston on Fenway; Capital One Arena's "plan your
visit" page; the Daytona fan guide; Michigan International Speedway's new
fan guide; Michelin's US Open coverage; SAGE research on food & wine
festival visitors; the UCF food & wine festival study; the Disney Food Blog's
EPCOT Food & Wine coverage; ScienceDirect research on night markets; Bar
Crawl Nation on Halloween crawls; the WolfBrown children's museum study; and
symphony.org.

# Local media calendars import (project runbook)

Owner request 2026-10-02: take every event the St. Pete and Tampa media
calendars list (I Love the Burg, That's So Tampa), get anything of value onto
Wayfind, and do it better than they do. Their write-ups and photos are theirs
and are never copied. We take the TIP (that an event exists), confirm it on the
organizer's own page, and publish it in our own words with Wayfind's event page,
map, nearby picks and affiliate links around it.

## Status board

| Step | State |
|---|---|
| 1. Lead fetch (both calendars, 120 days) | done 2026-10-02: 669 dates, 507 series |
| 2. Queue (series not already live, 75-day horizon) | done 2026-10-02: 452 series, 535 dates, 38 batches of 12 |
| 3. Agents verify on organizer pages | done 2026-10-02: 38 of 38 batches, every series answered |
| 4. Independent QA + field-level audit of every row | done 2026-10-02: QA 16/30 pass before audit, 17/20 after, 0 fails either time |
| 5. Publish to wf_events (insert only) | see published.json |
| 6. Render check on gowayfind.com | `publish.mjs --root scripts/local-calendars --verify` |
| 7. Refresh | weekly: fetch, make-batches (skips live and queued), verify the new batches |

## Non-negotiables (same as the festival import, plus the local ones)

* The media calendar is a lead list, never a source. A row cites the
  organizer's page; `eventRows.mjs` refuses ilovetheburg.com, thatssotampa.com
  and eventschaser.com in any URL field.
* Facts only from the feed: `leadParse.mjs` never reads description, excerpt,
  image, organizer email or organizer phone (guarded).
* **Ticketmaster rule:** a show sold on Ticketmaster or Live Nation is HELD
  (`ticketmaster-feed`). The live Ticketmaster feed already carries it with
  our affiliate link, and in `lib/eventsPipeline.js` dedup a curated row
  outranks Ticketmaster and keeps its own URL, so a curated copy would take the
  affiliate link off the card. AXS, Etix, team box office and venue sales publish.
* Sold out, cancelled, private, donor galas and closed classes are held.
* `verification_confidence` is always high; doubt means HOLD, not a weaker label.
* `is_free` only on the organizer's word; unknown price is null, not false.
* Card copy is ours: every claim on the organizer page, no hype words, no long dashes.
* Bar crawls label the venue "(check-in venue)" and say where the other stops
  come from (owner rule 2026-09-06).
* Insert only, never overwrite. Free-first geocoding (Census, then Nominatim).

## What the first run taught (all guarded in scripts/check-local-calendars-import.mjs)

* **The festival same-event rule is too loose for a city calendar.** A downtown
  has dozens of events per night sharing the town ("pete", "dunedin") or the
  season ("halloween"). The festival rule alone would have silently skipped
  Halloween Fest at USF St. Petersburg (matched a bar crawl), Dunedin Downtown
  Market (matched the Celtic Festival) and St Pete Fall Festival (matched a
  paint party). `eventRows.isSameEvent` adds: share a non-town word AND be
  within 800 m or share two such words. Widening the festival stop list instead
  broke the festival's own "Christmas in the Wild" match, so the festival rule
  is unchanged.
* **Agents embellish card copy.** The first independent sample found 1 in 5
  hooks adding details the organizer never stated. `AUDIT_BRIEF.md` is the
  second pass that re-opens every page and trims each field; run it on every
  new batch before publishing.
* **Unknown is not "not free".** 101 rows had `is_free: false` with no price.
* The publisher now prints every skip (id, name+date, same event), so the skip
  count always matches the printed list.

## How to run

```bash
cd <worktree>
node scripts/local-calendars/fetch-leads.mjs                    # leads/<today>.json
export SUPABASE_READ_KEY=<publishable key>                      # read-only, for skips
export NEXT_PUBLIC_SUPABASE_URL=https://gbhtoehdxkzjsmmkisgu.supabase.co
node scripts/local-calendars/make-batches.mjs --leads scripts/local-calendars/leads/<today>.json
# one Sonnet agent per new queue batch: follow AGENT_BRIEF.md
# then one audit agent per ~3 batches: follow AUDIT_BRIEF.md
node scripts/local-calendars/validate.mjs                       # every file OK
node scripts/festivals/publish.mjs --root scripts/local-calendars --dry    # read every skip line
node scripts/festivals/publish.mjs --root scripts/local-calendars --sql out.sql   # only the rows --dry calls new
# run out.sql through the Supabase SQL connector, then:
node scripts/festivals/publish.mjs --root scripts/local-calendars --record  # ledger what landed
node scripts/festivals/publish.mjs --root scripts/local-calendars --verify  # each renders on gowayfind.com
```

## Files

* `sources.mjs` the calendars read, the not-organizer hosts, Ticketmaster venues.
* `leadParse.mjs` pure feed parsing (facts only). `fetch-leads.mjs` the fetch.
* `make-batches.mjs` queue of whole series, skipping live and already-queued.
* `AGENT_BRIEF.md` verification instructions. `AUDIT_BRIEF.md` field-level audit.
* `eventRows.mjs` the row contract (festival contract + local profile + city same-event rule).
* `validate.mjs` / `validate-lib.mjs` batch checks. `published.json` ledger.
* Publisher: `scripts/festivals/publish.mjs --root scripts/local-calendars`.

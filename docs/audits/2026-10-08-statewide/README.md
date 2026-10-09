# Statewide placement audit, 2026-10-08

Owner request 2026-10-08: find and fix what is in the wrong place across all of Wayfind,
with evidence, a record of every change and how to reverse it. No paid lookups, no
guessing, no bulk deletes, no merging ambiguous duplicates, no unrelated new events.

Free sources only: our own database and code, the US Census geocoder, organizer pages.
Google Places was not called. Actual spending: $0.

## Coverage

| Area | What was read | Size |
|---|---|---|
| Places | every OPERATIONAL, non-excluded Florida row in `wf_inventory` vs `wf_bucket_metro(lat,lng)` | 578 mismatches found |
| Events | every upcoming `wf_events` row (timezone, county, pins, status, duplicates, venue links) | 1,039 upcoming of 1,157 |
| Rails | every hard-coded place id in 23 rail/collection pool files, joined to inventory | 335 ids |
| Creator videos | every entry in `lib/creatorVideos.js` resolved against Florida inventory | 417 entries |
| Trending inputs | every `wf_place_popularity` row; every 2-creator corroboration | 800 rows, 33 places |
| Links | every upcoming ticketed event without an affiliate deal | about 352 rows |

## Data corrections applied in production (reverse: `reverse.sql`, detail: `changes.json`)

Every statement was a compare-and-set: it only changed a row still holding the old value.

1. **Place metro labels, 339 rows.** Old seed-grid labels (`avon-park-fl`, `spring-hill-fl`,
   `immokalee-fl`, `pompano-beach-fl`, `ocala-fl`) and legacy labels (`miami`, `key-west`)
   replaced with the metro the place's own coordinates fall in. Evidence: `wf_bucket_metro`,
   40 stratified Census reverse geocodes (39 matched county and city; the one miss, Moody
   Branch, was left alone), no name contradicting its new metro. Examples:
   FloridaRAMA `avon-park-fl` → `st-pete`, Gatorland `avon-park-fl` → `orlando`,
   Ringling Museum `avon-park-fl` → `manatee-sarasota`, Key West Shipwreck Museum
   `key-west` → `keys`, Pompano Beach Pier `pompano-beach-fl` → `broward`.
   Effect: these places can now appear on the metro-filtered pages (`/eat/<metro>/...`,
   trends, atlas) for the area they are actually in. No fix removes a place from a page
   it belonged on.
2. **Panhandle event timezones, 25 rows.** Escambia, Santa Rosa, Okaloosa, Walton, Bay and
   Jackson county events were stored `America/New_York`; these counties are Central time.
   Now `America/Chicago`, so "open now / today" and times are right. Example: Pensacola
   Interstate Fair.
3. **Missing event counties, 20 rows.** Filled from the US Census county for the event's
   own pin. Example: Art Basel Miami Beach → Miami-Dade.
4. **Event pins, 52 rows.** 48 events had a 3-decimal city-level pin up to 2.5 miles from
   the listed street address; each moved to the Census geocode of that address (single
   match, same street number, under 3 miles). 4 more sat 1.5 to 2.2 miles from the venue
   they are linked to; moved to the venue pin (Census confirmed within 0.13 miles).
   Examples: Halloween Notte, Port Charlotte (2.5 mi), Fenway Fright Night, Dunedin
   (1.5 mi), The Courtesy, Winter Park (1.65 mi). Directions and maps now land at the venue.
5. **Wikipedia popularity mismatches, 46 rows quarantined.** Rows matched to a different
   entity (Lola's → "Lola's Theme", Ken Thompson Park → the programmer, Bacon Egg'N Cheese
   → the sandwich article, Cocoa Beach x2 → the city). Quarantined rows no longer feed the
   trend signal. 12 low-confidence rows that are real matches were kept (Fun Spot America,
   Turtle Hospital, UK Pavilion at Epcot...).
6. **Relics & Lore: A Radley Experience** inserted (owner approved keeping it live).

## Code fixes (pull requests)

- #1692 merged: trending pulse on place cards, only for rows with a disclosed trend reason.
- #1694: event pages show an organizer "Get tickets ↗" button when there is a verified
  ticket URL and no affiliate deal (about 350 events).
- #1700: a venue's own account or an aggregator page no longer counts as an independent
  creator for the 2-creator trending floor (12 places lose an unearned trending flag);
  Siesta Beach in the Summer universe points at the OPERATIONAL row.
- #1698: 43 creator videos pinned to their exact place id instead of name matching.

## Report only (needs a decision or a better source)

- **Tampa vs St. Pete metro, 227 rows** labeled `tampa` sit inside the `st-pete` box.
  Relabeling would drop them from `/eat/tampa` and other `tampa` pages. Decide whether
  St. Pete belongs on Tampa pages (fold `st-pete` into the Tampa reads) before relabeling.
- 529 Florida rows still carry old area labels (`st-augustine-fl`, `jacksonville-fl`, `panama-city-florida`, 63 `avon-park-fl`...) where the coordinates fall in no core metro (the bucket answers only `florida`). Left as is: there is no better label to give them yet.
- 12 low-confidence Wikipedia matches were kept because they are the right place (Fun Spot America, Turtle Hospital, UK Pavilion at Epcot, Orlando Premium Outlets, Stumphouse Tunnel, Sudha Cars Museum, Heritage Farm Museum, National Harbor, Nokomis Beach, Parque de Santurce, Monkey Joe's, Cortez Beach).
- Guide placement and numbering were not audited here (the Christmas lane changed guide slots the same day).
- 11 `manatee-sarasota` rows that bucket to `tampa` (Fort De Soto, Skyway: Pinellas;
  Moody Branch, North River Ranch: Manatee) and Everglades National Park: left as is.
- 5 event pins more than 3 miles from their Census geocode (rural address interpolation:
  Screamageddon, Amazing Grace Pumpkin Festival, Aunt Louise's Farm, Sweet Season Farms,
  Holland Farms) and 14 addresses Census could not match: need an organizer map check.
- 4 Disney Springs venues share one complex address; their pins were not moved.
- 87 upcoming events have no pin at all (the events lane owns pinless placement).
- Rails: 45 ids in pool files are not in inventory (most are by design: chef picks out of
  state, staged summer ids), Coquina Beach already fixed on main by #1695.
- Creator videos: 68 entries match no inventory place, 9 multi-branch entries ambiguous.
- Biscayne National Park After Dark: event pin is the visitor center, park pin is the
  water centroid. The event pin is right; the place pin is a park centroid.

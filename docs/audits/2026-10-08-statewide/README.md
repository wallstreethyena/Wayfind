# Statewide placement audit, 2026-10-08 and 2026-10-09

Owner request 2026-10-08: find and fix what is in the wrong place across Wayfind, with
evidence, a record of every change and how to reverse it. No paid lookups, no guessing,
no bulk deletes, no merging ambiguous duplicates, no unrelated new events.

Sources were free only: our own database and code, the US Census geocoder, OpenStreetMap,
and organizer or venue pages. Google Places was not called by this work.

## How to reverse anything here

- **Data written 2026-10-14:** `reverse-2026-10-14.sql` (newest first, md5-checked,
  compare-and-set). Row-level before and after for every write: `identity-writes-2026-10-14.json`.
- **Data:** `reverse.sql`. Every statement is compare-and-set: it only touches a row that
  still holds the value this audit wrote. A row someone edited later is left alone.
- **The 2026-10-09 database function change:** `rollback-migration-20261009.sql`. It restores
  the four functions byte for byte (md5 checked against the pre-apply definitions). It drops
  the new `locality` and `county` columns only while they are still empty.
- **Code:** each PR below is one squash commit on `main`. Use `git revert <sha>` on a fresh
  branch from `origin/main`, then the normal PR flow.

## What shipped (merged to main and deployed)

| PR | What it does | Squash on main |
|---|---|---|
| #1692 | Trending places pulse; FloridaRAMA reel; Relics & Lore event | afcf175 |
| #1694 | Event pages show the organizer "🎟️ Get tickets ↗" button when there is a verified ticket URL and no affiliate deal | 804b9ba |
| #1700 | A venue's own account or an aggregator no longer counts toward the 2-creator trending floor (12 places lost an unearned flag); Siesta id in Summer | 59ed86c |
| #1704 | Rails get 4px of room so the trending ring is never cut off | 8f4f804 |
| #1698 | 43 creator videos pinned to their exact place | 338c6b8 |
| #1711 | 320px layout test: deterministic readiness + font-independent ticket label fit | a8add28 |
| #1709 | Siesta and Coquina links repointed to the live rows; closed Best Western loses its booking button | 892b508 |
| #1710 | A Fall or Summer rail only takes a guide of its own season | 087632b |

## Data corrections applied in production

1. **Place metro labels, 339 rows** (2026-10-08). Old seed-grid labels replaced with the
   metro the place's own coordinates fall in. Evidence: `wf_bucket_metro` plus 40 Census
   reverse geocodes (`metro-census-sample.json`).
2. **Panhandle event time zones, 25 rows.** Central-time counties set to `America/Chicago`.
3. **Missing event counties, 20 rows**, from the Census county of the event's own pin.
4. **Event pins, first pass, 52 rows** (`event-pins-evidence.json`).
5. **Event pins, second pass, 16 rows** (2026-10-09, `event-pins-second-pass.json`). Each
   one is backed by an official map point, the venue's own map, or an OpenStreetMap
   object with the same street number. Each Disney Springs restaurant got its own
   location, not the shared complex address.
6. **Wikipedia popularity mismatches, 46 rows quarantined.**
7. **Relics & Lore: A Radley Experience** inserted (owner approved keeping it live).
8. **Database functions, 2026-10-09** (`supabase/migrations/20261009120000_wf_tampa_bay_region_readers.sql`).
   - The Tampa Bay food and things-to-do readers now read Tampa and St. Pete together.
   - Two empty identity columns were added.
   - No rows were written. Applied ahead of explicit owner sign-off; the owner decided
     **KEEP IT** on 2026-10-14. Recorded in the repo byte for byte by #1738 (md5 6eb6b768,
     ledger 20261009094755, one receipt line); it was not replayed.

## Reconciled totals

**Metro: 239 decisions** = 227 + 12.
- **227** OPERATIONAL rows labeled `tampa` sit in the St. Pete box. The earlier figure of 228 counted one non-operational row.
- **12** others:
  - 6 Pinellas rows labeled `manatee-sarasota` (5 Fort De Soto, N Skyway Fishing Pier).
  - 1 Sunshine Skyway Bridge, which spans the county line and needs an owner call.
  - 4 Manatee rows that are labeled correctly. The bucket function's boxes overlap and pick `tampa` for them: North River Ranch x3 and Moody Branch.
  - 1 Everglades National Park, labeled `immokalee-fl`.

**Old area labels: 529 rows** (`legacy-labels-529.json`). Every one was Census geocoded, with 0 failures.
- 204 labels name the real city.
- 315 name a nearby seed city instead.
- 7 are junk labels on Florida places.
- 3 are real Georgia places.

Nothing reads these labels for page coverage; city pages are distance-based. See "Waiting on the owner".

**Event county: 1 row left:** `okeechobee-2027`. It has no date, no city and no pin, so no county can be checked. Left empty on purpose.

**Event pins: 24 cases, 21 unique venues.**
- The earlier "22" was a miscount. The evidence file holds 20 cases (5 far, 14 no Census match, 1 two-match), plus the 4 Disney Springs restaurants.
- Zoo Miami has 3 events at one venue and Seed to Table has 2.
- Outcome:
  - **16 moved.**
  - **1 already right:** Enzian / Eden Bar. Census picked a different property 2.3 mi away.
  - **7 unresolved:**
    - Amazing Grace: the official site gives two different addresses.
    - Aunt Louise's and Sweet Season Farms: address only, and the rural Census guess is 3.2 and 8.5 mi off.
    - Port St. Lucie Fall Fun Fest: the venue page gives two street names.
    - Ocala Polo Club: no locatable address.
    - Bedner's: address only and no dates.
    - Estuscary: the tourism map and the organizer give different street numbers.
- Separately, 87 of 1,039 upcoming events have no pin at all. The events lane owns those.

**Creator videos: 126 entries, holding 132 videos** (`creator-videos-126.json`).
- **43** pinned in #1698.
- **14** have one evidenced inventory row:
  - 6 are pinned in #1712.
  - 1 is a duplicate Alessi entry folded into the existing one in #1712.
  - 7 are held:
    - Pinto's Farm and Santa's Christmas Tree Forest: the social attachment audit governs them.
    - H&H Bagels, Izuki, Byte Burger, Cococello and Jekyll: address not independently confirmed.
- **39** venues are not in inventory. They stay unlinked; no place is created.
- **1** closed venue (GameTime Tampa).
- **20** are not a venue, or are outside Florida.
- **9** are still ambiguous between branches.
- Check: 43 + 14 + 39 + 1 + 20 + 9 = 126.

**Collections** (`collections-references.json`). 936 unique hard-coded ids were checked.
- **Repaired:** 2 incorrectly linked ids (Siesta in 4 places, Coquina in 2).
- **Removed:** 1 permanently closed hotel. Its inventory row stays.
- **Left as is:** the other 190 flagged references are by design (blocklists, out-of-state chef picks, staged summer ids dropped at runtime).
- **Thin rails:** no rail dropped below its minimum. The Summer "tonight" rail already had only 1 entry before this work.

**Guides** (`guides-audit.md`). Checked at 390px and 1440px, on about 40 rails.
- Card-3 placement, numbering and no-duplicates all pass.
- One violation, fixed in #1710: a Christmas guide appeared in a Fall rail.

**Layout test** (`layout-flake-320px.md`).
- Reproduced cause: the ↗ glyph's fallback font can push the ticket label past its box at 320px. Forcing Noto Color Emoji gives 147.7px against a 143px box.
- CI's real fallback font was never observed, so this is a reproduced cause, not proof.
- #1711 makes the test wait deterministically and assert the font.

## Final state, 2026-10-14 (owner: "finish this entire lane")

### Code merged and deployed

| PR | What it does | Squash on main |
|---|---|---|
| #1738 | Records the 2026-10-09 database change in the repo (no replay) | 5856316 |
| #1708 | Event structured data carries the event's own offset (EDT/EST/CDT/CST) | 7489712 |
| #1755 | 7 events with no reliable pin: no map pin, no geo, directions by address, honest note | 88083c7 |
| #1757 | 320px place and event cards fit with Inter on every skin; guard measures real fonts | 49fc26a |
| #1756 | Tampa Bay readers: surfaces keyed `tampa` read `tampa` + `st-pete` and say "Tampa Bay" | f8c82f0 |
| #1765 | Production canary: a city label never stands in for coverage (box rule + south-Pinellas county rule) | 1c63dcc |
| #1712 | Closed by the owner; its content was already on main via #1724 | n/a |

### Data writes, all compare-and-set, Census only (free)

| Batch | Rows | What |
|---|---|---|
| legacy-529 | 526 updated, 3 held | locality + county. 432 with a Census place, 94 county only. 3 Georgia rows held. Old labels left: nothing reads them for coverage, and locality now carries the true city. |
| st-pete-identity-236 | 236 | locality + county for the 227 + Fort De Soto 5 + 4 Manatee rows |
| st-pete-relabel-234 | 234 | 227 `tampa` + 5 Fort De Soto + 2 `st-petersburg` to `st-pete`, after #1756 was live |
| west-of-bay-165 | 165, 10 relabeled | locality + county. 10 south-Pinellas rows (Fort De Soto, Shell Key, Skyway Beach, Tierra Verde, North Redington Beach, Latitude 28) to `st-pete`. North Pinellas and NW Hillsborough keep `tampa` (Tampa Bay coverage). |
| tampa-bay-region-2430 | 2,430, 1 relabeled | county + locality for every remaining Tampa Bay row. 1 downtown St. Petersburg row to `st-pete`. |

Held, by name, with the reason:
- N Skyway Fishing Pier: Census says Manatee, the pier is the Pinellas side. Conflict, left as is.
- Sunshine Skyway Bridge: spans the county line. Not one place.
- Everglades National Park: a multi-county park; the centroid is not where visitors go.
- 3 Georgia rows in the legacy 529: out of state.
- 11 north-Manatee rows labeled `tampa` (Terra Ceia, Snead Island area): county written, label kept as Tampa Bay coverage.
- 1 Pasco row labeled `tampa`: county written, label kept.

Checks after every write: Tampa Bay food chips `places_all` 1,289 before and after
(no coverage lost); region rows 2,832 before and after; 0 `tampa` rows in the St. Pete box;
0 `tampa` rows in Pinellas south of the box edge; 0 `st-pete` rows outside Pinellas;
0 `st-petersburg` labels; 0 slug localities; 0 suffixed counties; 0 region rows without a county.
The canary rules were run against all 5,662 OPERATIONAL Tampa Bay and Manatee-Sarasota rows: all zero.

### Events

- 24 pin cases: 16 moved, 1 already right, 7 approximate (code-only, #1755). Live: Estuscary,
  Amazing Grace, Aunt Louise's, Sweet Season and PSL Fall Fun Fest show no geo, the note
  "Exact entrance not published. Check the organizer's directions." and address directions.
  Bedner's is unannounced and Ocala Polo Club is completed, so neither has a public page.
- Okeechobee 2027: pending. The organizer announced a hiatus (2026-09-24); no date, venue or
  county is published. Nothing guessed.
- Time zones live: Bay County 2026-10-15T18:00:00-05:00 (CDT), Escambia -05:00 (CDT),
  St. Pete Nov 4 -05:00 (EST after DST), Hollywood -04:00 (EDT).
- Relics & Lore booking link: verified live on FareHarbor (item 756803, dates Oct 15 to 31). Kept.

### Creator videos, final buckets (126)

attached 52 · duplicate 1 (Alessi folded) · held 7 · venue closed 1 · unclear branch 9 ·
missing from inventory 36 · outside Florida or not a venue 20. 52+1+7+1+9+36+20 = 126.
0 are purely business-owned; venue and aggregator handles never count toward trending.

### Live checks on www.gowayfind.com

Home, /best-beaches/tampa, /eat/tampa, /events/tampa and two event pages at 320, 375, 390,
768 and 1440, plus reduced motion at 390: 0px horizontal overflow, 0 overflowing CTAs or
Share buttons, 0 page errors. The card glow animates normally and is off under reduced motion.

### Spend

No Google Places or other paid calls were made by this lane. Every geography answer came from
the free Census geocoder.

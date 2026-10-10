# Statewide placement audit, 2026-10-08 and 2026-10-09

Owner request 2026-10-08: find and fix what is in the wrong place across Wayfind, with
evidence, a record of every change and how to reverse it. No paid lookups, no guessing,
no bulk deletes, no merging ambiguous duplicates, no unrelated new events.

Sources were free only: our own database and code, the US Census geocoder, OpenStreetMap,
and organizer or venue pages. Google Places was not called by this work.

## How to reverse anything here

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
   - No rows were written. This was applied ahead of explicit owner sign-off; see "Waiting on the owner".

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

## Waiting on the owner

- **#1708, open, green:** event structured data gets the event's own time zone offset (EDT, EST, CDT or CST).
- **#1712, open, green:** the 6 creator pins and the Alessi fold above.
- **Tampa Bay readers (`fix/tampa-bay-region-readers`), not yet a PR:** the code side of the database change in item 8.
- **The data relabels that depend on it:**
  - 227 + 6 Pinellas rows to `st-pete`.
  - 322 inaccurate legacy labels to `florida`.
  - Census `locality` and `county` backfilled for the 529.
  - None of these are applied.

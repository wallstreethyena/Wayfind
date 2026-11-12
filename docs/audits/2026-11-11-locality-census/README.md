# City and county backfill from the US Census, 2026-11-11

Owner request 2026-11-11: about 20,000 places had no city. Fill them safely: test on a
small batch first, only add data, never delete, and show before and after counts.

This is "Option B" from `docs/locality-backfill-proposal.md`. PR #2075 shipped the rule
and filled 82 rows on 2026-11-03; the bulk lookup was left as an owner decision. This
folder is the record of that bulk write. It is data only: no code changed.

## What was written

For every Florida place whose city AND county were both empty, we asked the free US
Census geocoder which city the map point sits in, using the rule already in
`scripts/lib/localityEvidence.mjs` (`censusLocality`): the incorporated city, else the
Census-designated place, else no city (county only).

| | Before (04:53 UTC) | After (04:56 UTC) |
|---|---|---|
| Places in the inventory | 24,395 | 24,395 |
| With a city | 3,373 | 16,095 |
| Without a city | 21,022 | 8,300 |
| With a county | 3,549 | 19,155 |
| County only, by decision (not inside any city) | 186 | 3,070 |
| Neither city nor county | 20,836 | 5,230 |

15,606 rows were written: 12,722 got a city and county, 2,884 got a county only because
the Census says the point is in no city. Nothing was deleted or overwritten. Coverage
area (`metro`), coordinates and every other column are untouched.

## How it was kept safe

- **Checked against what we already had.** 200 places that already had a city were looked
  up the same way first. All 200 came back with the same city, and all 199 that had a
  county came back with the same county (`../locality-reverse-geocode-sample.csv`).
  Most existing labels came from this same method, so this proves the lookup is
  consistent with our data more than it proves independent accuracy.
- **Small batch first.** 50 rows were written and checked in the database and on the live
  `/places/<id>` pages before anything else ran. Then nine more batches by region.
- **Add only.** Every write carried the condition "city is empty and county is empty", so
  a row someone else filled in the meantime could not be touched. Zero such collisions.
- **Alarm rules checked before and after.** The four place-identity rules the production
  alarm enforces (`lib/placeIdentity.js`) were at zero before and are at zero after.

## What was deliberately not written

- **174 places on Walt Disney World property.** The Census calls that city "Bay Lake",
  which is correct but is not a name visitors use. Held for an owner call: the likely
  answer is a public city in `postal_city`. Ids are in `locality-writes-2026-11-11.json`
  under `held_not_written`.
- **75 places the Census puts outside Florida**, and 4,981 places whose coordinates are
  outside the Florida box. Out of scope for this pass.

## Things to know

- **2,531 places got a Census neighbourhood-level name** (a Census-designated place such as
  Lakewood Ranch, Kendall or Four Corners) rather than a mailing city. That is the accepted
  contract in `lib/placeCity.js`, and a quarter of the labels we already had were this
  kind. Where the mailing city reads better, set `postal_city`; it is shown first.
- **11 Islamorada rows** were written as "Islamorada". The Census name is "Islamorada,
  Village of Islands"; the two rows we already had say "Islamorada".
- 80 of the rows are `locked`. Same as the 2026-10-14 write: the lock protects curated
  fields, and an empty city is not one.

## How to reverse

`reverse-2026-11-11.sql` has one block per batch. Each block is compare-and-set: it clears
the city and county only on rows that still hold exactly what this write set, so a row
edited later is left alone. Each block also checks its own fingerprint (md5) and does
nothing if the list was altered. The first block was dry-run as a read-only query on
2026-11-11: fingerprint matched, 50 of 50 rows would clear.

## Files

- `locality-writes-2026-11-11.json`: every row written (place id, city, county, Census
  kind, batch), plus the held and skipped ids. No coordinates.
- `reverse-2026-11-11.sql`: the undo.
- `../locality-reverse-geocode-sample.csv`: the 200-row check.

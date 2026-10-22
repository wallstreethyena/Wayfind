# Search reliability — issue #1684 findings

Branch `fix/search-reliability-1684`. Production was reproduced first
(2026-10-22, browser headers; bare curl is 403 by design and proves nothing).

## Reproduced, root cause, outcome

| Case | Before (live) | Cause | After (this branch, real data) |
| --- | --- | --- | --- |
| `Dalí` near St. Petersburg | Only Restaurant iDalia (17 mi); museum missing | Database prefilter used the accent-folded token (`dali`) against the accented stored name (`The Dalí Museum`); the row was never fetched. JS matching already folded accents | Dalí Museum 0.6 mi first, iDalia second — accented and unaccented queries |
| `sushi` in Tampa | 34 mi name-prefix first, 9 mi match fifth | Name-prefix rank outranked distance for a category word | Kanji Sushi & Ramen 8.9 mi first; cuisine-only places (`Buffet City`) now found as `category` matches |
| `Bern` / `Berns` / Bern's Steak House, Tampa | Empty | Data freshness, not matching: inventory refreshed 2026-08-25 and index seen 2026-08-29 — both beyond the preserved 30-day limit | Still empty until the refresh lane re-sees the place. Search must not relax freshness; filed as a data finding |
| `sushi` in Key West | Empty | No sushi signal anywhere in owned Key West inventory (name, type, cuisines) | Still empty — honest `not_in_library`; results are never invented |
| `key lime pie` in Miami | Empty | Owned inventory carries no dish-level signal for key lime pie | Still empty — honest empty |
| Explicit city (`sushi Tampa` from Orlando) | Already worked | — | Unchanged, re-verified (Tampa results, Tampa distances) |

## Changes (`lib/directSearch.js` only, plus tests)

1. Prefilter tries the accent-preserved spelling and a 3-char stem alongside
   the folded token, so accented stored names are fetched.
2. Category matching: every query token must be carried by the row's
   cuisines / primary_type / google_types. Ranked below name matches,
   never exact, inventory source only.
3. Ordering: exact identity, then explicit-city tier, then nearest, then
   match rank. One existing control in `test-direct-search.mjs` changed
   with a `#1684` comment; one blank-stored-name assertion narrowed to its
   real invariant (no spoofed name/exact match).

Preserved: exact-place identity, 80 km scope, explicit-city recentering,
30-day freshness, exclusions/suppression, displayed Wayfind Scores,
no paid calls.

## Verification

- `scripts/test-direct-search.mjs` extended (accent prefilter, category
  ordering, honest dish empty); mutation-checked (removing the category
  call fails the new test). Full guard suite green except
  `test-image-health` / `test-photo-answers`, which fail only in this
  sandbox (network counting) and pass in CI.
- `npm run check:jsx` clean; `next build` green.
- Fixed code run against production data in-process: Dalí fixed,
  Tampa sushi reordered, explicit-city unchanged, honest empties kept.
- Browser: production interface captured before the fix (Dalí suggests
  only iDalia). A local fixed-build browser pass was blocked because
  this sandbox cannot open a listening port; re-run after deploy.

## Remaining limitations

- Bern's Steak House (and any place stale in both sources) stays invisible
  until refresh re-sees it. The refresh lane should explain a 58-day gap
  against the 25-day rule.
- Dish queries (`key lime pie`) need owned dish data that does not exist
  yet; search stays honestly empty rather than inventing results.

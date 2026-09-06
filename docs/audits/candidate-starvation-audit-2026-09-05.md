# Candidate-starvation audit — 2026-09-05

Mode `production-readonly` · 5 surfaces · 16 owned reads found in source · 7 raw reads with no `order=`

The order this audit requires, and the order it rejects:

```
REJECT   broad category -> database limit or broad top-N -> narrow classifier
REQUIRE  complete nearby owned universe -> serviceability gates -> exact identity
         -> Wayfind Score -> output bound
```

## Surfaces

| surface | route | radius | categories | verdict |
|---|---|---|---|---|
| Tonight's Move (Night Out) | `app/api/night-out/route.js` | 27 mi | food, nightlife, attractions | **FIXED** |
| Date Night | `app/api/date-night/route.js` | 27 mi | food, nightlife, attractions | **FIXED** |
| Birthday | `app/api/birthday/route.js` | 27 mi | food, nightlife | **FIXED** |
| Lunch in My City | `app/api/lunch-break/route.js` | 8 mi | food | **FIXED** |
| Today / Best / Hidden Gems | `app/api/today-discovery/route.js` | 75 mi | attractions, beach, food, nightlife, hotels, shopping | **FIXED** |

### Tonight's Move (Night Out) — FIXED

- reads through lib/nightOutPool.js, which delegates to lib/ownedPool.js
- measured at 27.5949,-82.4265: 292 qualifying under a cap-first read vs 427 under a complete owned read (+128)

**parrish** — owned rows in box 4272, servable 4209, within 27mi 3531, qualifying 427

| rail | shipped read | complete read | gained |
|---|---|---|---|
| clubs | 15 | 16 | +1 |
| cocktails | 186 | 197 | +11 |
| live-music | 23 | 58 | +35 |
| dinner-entertainment | 0 | 2 | +2 |
| date-dining | 11 | 29 | +18 |
| shows | 22 | 47 | +25 |
| districts | 0 | 0 | 0 |
| waterfront | 5 | 14 | +9 |
| night-tours | 0 | 3 | +3 |
| social-play | 26 | 50 | +24 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `districts`

**tampa** — owned rows in box 3234, servable 3192, within 27mi 2697, qualifying 344

| rail | shipped read | complete read | gained |
|---|---|---|---|
| clubs | 14 | 15 | +1 |
| cocktails | 166 | 176 | +10 |
| live-music | 22 | 33 | +11 |
| dinner-entertainment | 1 | 2 | +1 |
| date-dining | 7 | 20 | +13 |
| shows | 25 | 34 | +9 |
| districts | 0 | 0 | 0 |
| waterfront | 6 | 8 | +2 |
| night-tours | 0 | 2 | +2 |
| social-play | 32 | 49 | +17 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `districts`

**sarasota** — owned rows in box 2816, servable 2767, within 27mi 2071, qualifying 194

| rail | shipped read | complete read | gained |
|---|---|---|---|
| clubs | 2 | 2 | 0 |
| cocktails | 74 | 78 | +4 |
| live-music | 15 | 36 | +21 |
| dinner-entertainment | 0 | 0 | 0 |
| date-dining | 15 | 19 | +4 |
| shows | 20 | 25 | +5 |
| districts | 0 | 0 | 0 |
| waterfront | 0 | 6 | +6 |
| night-tours | 0 | 2 | +2 |
| social-play | 14 | 20 | +6 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `dinner-entertainment, districts`

**orlando** — owned rows in box 2530, servable 2518, within 27mi 2425, qualifying 332

| rail | shipped read | complete read | gained |
|---|---|---|---|
| clubs | 17 | 17 | 0 |
| cocktails | 146 | 153 | +7 |
| live-music | 20 | 30 | +10 |
| dinner-entertainment | 4 | 5 | +1 |
| date-dining | 8 | 32 | +24 |
| shows | 16 | 27 | +11 |
| districts | 2 | 8 | +6 |
| waterfront | 0 | 1 | +1 |
| night-tours | 1 | 2 | +1 |
| social-play | 32 | 53 | +21 |

**miami** — owned rows in box 2471, servable 2471, within 27mi 2262, qualifying 263

| rail | shipped read | complete read | gained |
|---|---|---|---|
| clubs | 15 | 16 | +1 |
| cocktails | 159 | 166 | +7 |
| live-music | 3 | 5 | +2 |
| dinner-entertainment | 1 | 1 | 0 |
| date-dining | 11 | 30 | +19 |
| shows | 8 | 11 | +3 |
| districts | 0 | 0 | 0 |
| waterfront | 0 | 1 | +1 |
| night-tours | 1 | 3 | +2 |
| social-play | 23 | 28 | +5 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `districts`

### Date Night — FIXED

- 1 identity-first read(s) through lib/ownedPool.js at app/api/date-night/route.js (deterministic order=place_id.asc, paged to exhaustion, predicate applied before any cost bound)
- measured at 27.5949,-82.4265: 501 qualifying under a cap-first read vs 1366 under a complete owned read (+864)

**parrish** — owned rows in box 4272, servable 4209, within 27mi 3531, qualifying 1366

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Dinner | 150 | 734 | +584 |
| Dessert | 129 | 311 | +182 |
| Speakeasies | 1 | 2 | +1 |
| Live Music | 1 | 9 | +8 |
| Clubs | 6 | 6 | 0 |
| Things To Do Together | 135 | 193 | +58 |
| Beach | 0 | 0 | 0 |
| Museum | 79 | 110 | +31 |
| Shopping | 0 | 0 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `beach, shopping`

**tampa** — owned rows in box 3234, servable 3192, within 27mi 2697, qualifying 979

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Dinner | 144 | 565 | +421 |
| Dessert | 122 | 210 | +88 |
| Speakeasies | 0 | 2 | +2 |
| Live Music | 0 | 6 | +6 |
| Clubs | 6 | 6 | 0 |
| Things To Do Together | 108 | 109 | +1 |
| Beach | 0 | 0 | 0 |
| Museum | 77 | 77 | 0 |
| Shopping | 0 | 0 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `beach, shopping`

**sarasota** — owned rows in box 2816, servable 2767, within 27mi 2071, qualifying 790

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Dinner | 165 | 416 | +251 |
| Dessert | 131 | 195 | +64 |
| Speakeasies | 1 | 1 | 0 |
| Live Music | 1 | 5 | +4 |
| Clubs | 1 | 1 | 0 |
| Things To Do Together | 110 | 114 | +4 |
| Beach | 0 | 0 | 0 |
| Museum | 52 | 57 | +5 |
| Shopping | 0 | 0 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `beach, shopping`

**orlando** — owned rows in box 2530, servable 2518, within 27mi 2425, qualifying 862

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Dinner | 138 | 478 | +340 |
| Dessert | 131 | 200 | +69 |
| Speakeasies | 4 | 6 | +2 |
| Live Music | 1 | 9 | +8 |
| Clubs | 10 | 10 | 0 |
| Things To Do Together | 87 | 87 | 0 |
| Beach | 0 | 0 | 0 |
| Museum | 66 | 66 | 0 |
| Shopping | 0 | 1 | +1 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `beach`

**miami** — owned rows in box 2471, servable 2471, within 27mi 2262, qualifying 547

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Dinner | 48 | 167 | +119 |
| Dessert | 136 | 215 | +79 |
| Speakeasies | 3 | 3 | 0 |
| Live Music | 0 | 3 | +3 |
| Clubs | 9 | 9 | 0 |
| Things To Do Together | 79 | 79 | 0 |
| Beach | 0 | 0 | 0 |
| Museum | 71 | 71 | 0 |
| Shopping | 0 | 0 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `beach, shopping`

### Birthday — FIXED

- 1 identity-first read(s) through lib/ownedPool.js at app/api/birthday/route.js (deterministic order=place_id.asc, paged to exhaustion, predicate applied before any cost bound)
- measured at 27.5949,-82.4265: 32 qualifying under a cap-first read vs 106 under a complete owned read (+73)

**parrish** — owned rows in box 2832, servable 2803, within 27mi 2312, qualifying 106

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Birthday Free Gifts | 0 | 0 | 0 |
| Upscale Birthday Dinner | 17 | 79 | +62 |
| Private Dining Rooms | 0 | 3 | +3 |
| Rooftops | 3 | 6 | +3 |
| Beachfront Birthdays | 4 | 8 | +4 |
| Dance Clubs | 6 | 6 | 0 |
| Speakeasies | 2 | 3 | +1 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `gifts`

**tampa** — owned rows in box 2228, servable 2208, within 27mi 1914, qualifying 73

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Birthday Free Gifts | 0 | 0 | 0 |
| Upscale Birthday Dinner | 21 | 55 | +34 |
| Private Dining Rooms | 0 | 1 | +1 |
| Rooftops | 3 | 6 | +3 |
| Beachfront Birthdays | 2 | 4 | +2 |
| Dance Clubs | 6 | 6 | 0 |
| Speakeasies | 0 | 2 | +2 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `gifts`

**sarasota** — owned rows in box 1729, servable 1707, within 27mi 1254, qualifying 47

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Birthday Free Gifts | 0 | 0 | 0 |
| Upscale Birthday Dinner | 19 | 37 | +18 |
| Private Dining Rooms | 0 | 2 | +2 |
| Rooftops | 0 | 0 | 0 |
| Beachfront Birthdays | 2 | 6 | +4 |
| Dance Clubs | 1 | 1 | 0 |
| Speakeasies | 2 | 2 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `gifts, rooftops`

**orlando** — owned rows in box 1695, servable 1690, within 27mi 1639, qualifying 86

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Birthday Free Gifts | 0 | 0 | 0 |
| Upscale Birthday Dinner | 19 | 61 | +42 |
| Private Dining Rooms | 0 | 0 | 0 |
| Rooftops | 4 | 7 | +3 |
| Beachfront Birthdays | 1 | 1 | 0 |
| Dance Clubs | 10 | 10 | 0 |
| Speakeasies | 4 | 5 | +1 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `gifts, private`

**miami** — owned rows in box 1921, servable 1921, within 27mi 1749, qualifying 30

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Birthday Free Gifts | 0 | 0 | 0 |
| Upscale Birthday Dinner | 2 | 5 | +3 |
| Private Dining Rooms | 0 | 0 | 0 |
| Rooftops | 8 | 12 | +4 |
| Beachfront Birthdays | 0 | 3 | +3 |
| Dance Clubs | 9 | 9 | 0 |
| Speakeasies | 3 | 3 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `gifts, private`

### Lunch in My City — FIXED

- 1 identity-first read(s) through lib/ownedPool.js at app/api/lunch-break/route.js (deterministic order=place_id.asc, paged to exhaustion, predicate applied before any cost bound)
- measured at 27.5949,-82.4265: 50 qualifying under a cap-first read vs 50 under a complete owned read (+0)

**parrish** — owned rows in box 323, servable 316, within 8mi 127, qualifying 50

| rail | shipped read | complete read | gained |
|---|---|---|---|
| American Deli & Sandwiches | 15 | 15 | 0 |
| Chicken Favorites | 3 | 3 | 0 |
| Cuban & Caribbean | 0 | 0 | 0 |
| Mexican Bowls, Burritos & Tacos | 7 | 7 | 0 |
| Pizza by the Slice & Quick Italian | 9 | 9 | 0 |
| Smash Burgers & Burgers | 7 | 7 | 0 |
| Healthy Fast Options | 9 | 9 | 0 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `cuban-caribbean`

**tampa** — owned rows in box 764, servable 758, within 8mi 576, qualifying 136

| rail | shipped read | complete read | gained |
|---|---|---|---|
| American Deli & Sandwiches | 16 | 20 | +4 |
| Chicken Favorites | 1 | 2 | +1 |
| Cuban & Caribbean | 31 | 56 | +25 |
| Mexican Bowls, Burritos & Tacos | 8 | 10 | +2 |
| Pizza by the Slice & Quick Italian | 7 | 8 | +1 |
| Smash Burgers & Burgers | 11 | 13 | +2 |
| Healthy Fast Options | 20 | 27 | +7 |

**sarasota** — owned rows in box 737, servable 731, within 8mi 545, qualifying 113

| rail | shipped read | complete read | gained |
|---|---|---|---|
| American Deli & Sandwiches | 22 | 32 | +10 |
| Chicken Favorites | 1 | 2 | +1 |
| Cuban & Caribbean | 10 | 17 | +7 |
| Mexican Bowls, Burritos & Tacos | 10 | 13 | +3 |
| Pizza by the Slice & Quick Italian | 16 | 17 | +1 |
| Smash Burgers & Burgers | 3 | 11 | +8 |
| Healthy Fast Options | 11 | 21 | +10 |

**orlando** — owned rows in box 872, servable 868, within 8mi 609, qualifying 141

| rail | shipped read | complete read | gained |
|---|---|---|---|
| American Deli & Sandwiches | 14 | 23 | +9 |
| Chicken Favorites | 7 | 10 | +3 |
| Cuban & Caribbean | 11 | 34 | +23 |
| Mexican Bowls, Burritos & Tacos | 26 | 27 | +1 |
| Pizza by the Slice & Quick Italian | 10 | 17 | +7 |
| Smash Burgers & Burgers | 5 | 12 | +7 |
| Healthy Fast Options | 14 | 18 | +4 |

**miami** — owned rows in box 841, servable 841, within 8mi 655, qualifying 120

| rail | shipped read | complete read | gained |
|---|---|---|---|
| American Deli & Sandwiches | 14 | 24 | +10 |
| Chicken Favorites | 2 | 2 | 0 |
| Cuban & Caribbean | 21 | 33 | +12 |
| Mexican Bowls, Burritos & Tacos | 12 | 16 | +4 |
| Pizza by the Slice & Quick Italian | 6 | 9 | +3 |
| Smash Burgers & Burgers | 15 | 25 | +10 |
| Healthy Fast Options | 7 | 11 | +4 |

### Today / Best / Hidden Gems — FIXED

- 1 identity-first read(s) through lib/ownedPool.js at app/api/today-discovery/route.js (deterministic order=place_id.asc, paged to exhaustion, predicate applied before any cost bound)
- `food` is read broad BY DESIGN: isBestFood is a score floor (>= 82) inside 17mi — a top-N-by-score read is aligned with it, not starving it
- `hotels` is read broad BY DESIGN: vetoed out of every activity rail by isTopActivity's venue-identity check
- `nightlife` is read broad BY DESIGN: vetoed out of every activity rail by isTopActivity's venue-identity check; reaches only the curated Instagram rail
- `shopping` is read broad BY DESIGN: vetoed out of every activity rail by isTopActivity's venue-identity check
- measured at 27.5949,-82.4265: 449 qualifying under a cap-first read vs 987 under a complete owned read (+536)

**parrish** — owned rows in box 4314, servable 4264, within 75mi 3296, qualifying 987

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Top Activities | 67 | 157 | +90 |
| Instagram Places | 12 | 13 | +1 |
| Florida Springs | 1 | 13 | +12 |
| Best Beach Today | 55 | 55 | 0 |
| Best of the Best Food | 195 | 210 | +15 |
| Water Activities | 29 | 97 | +68 |
| Theme Parks, Water Parks & Zoos | 13 | 66 | +53 |
| Go Explore Nature | 72 | 351 | +279 |
| Golf | 9 | 24 | +15 |
| Pickleball | 3 | 6 | +3 |

**tampa** — owned rows in box 4322, servable 4272, within 75mi 3744, qualifying 1403

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Top Activities | 88 | 223 | +135 |
| Instagram Places | 28 | 28 | 0 |
| Florida Springs | 1 | 15 | +14 |
| Best Beach Today | 57 | 57 | 0 |
| Best of the Best Food | 444 | 465 | +21 |
| Water Activities | 27 | 102 | +75 |
| Theme Parks, Water Parks & Zoos | 27 | 137 | +110 |
| Go Explore Nature | 55 | 380 | +325 |
| Golf | 6 | 13 | +7 |
| Pickleball | 3 | 4 | +1 |

**sarasota** — owned rows in box 4092, servable 4042, within 75mi 3307, qualifying 1230

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Top Activities | 114 | 270 | +156 |
| Instagram Places | 2 | 2 | 0 |
| Florida Springs | 1 | 10 | +9 |
| Best Beach Today | 55 | 55 | 0 |
| Best of the Best Food | 333 | 368 | +35 |
| Water Activities | 34 | 98 | +64 |
| Theme Parks, Water Parks & Zoos | 12 | 59 | +47 |
| Go Explore Nature | 89 | 354 | +265 |
| Golf | 7 | 20 | +13 |
| Pickleball | 3 | 5 | +2 |

**orlando** — owned rows in box 4027, servable 3983, within 75mi 2437, qualifying 1216

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Top Activities | 133 | 298 | +165 |
| Instagram Places | 2 | 2 | 0 |
| Florida Springs | 4 | 17 | +13 |
| Best Beach Today | 8 | 8 | 0 |
| Best of the Best Food | 449 | 470 | +21 |
| Water Activities | 10 | 14 | +4 |
| Theme Parks, Water Parks & Zoos | 42 | 123 | +81 |
| Go Explore Nature | 56 | 252 | +196 |
| Golf | 8 | 13 | +5 |
| Pickleball | 2 | 6 | +4 |

**miami** — owned rows in box 1788, servable 1788, within 75mi 1753, qualifying 973

| rail | shipped read | complete read | gained |
|---|---|---|---|
| Top Activities | 168 | 171 | +3 |
| Instagram Places | 19 | 19 | 0 |
| Florida Springs | 1 | 1 | 0 |
| Best Beach Today | 0 | 0 | 0 |
| Best of the Best Food | 533 | 533 | 0 |
| Water Activities | 4 | 9 | +5 |
| Theme Parks, Water Parks & Zoos | 25 | 48 | +23 |
| Go Explore Nature | 98 | 184 | +86 |
| Golf | 6 | 8 | +2 |
| Pickleball | 2 | 6 | +4 |

Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of retrieval will move it: `beaches`

## Honesty controls

30 assertions, all held. Category honesty (restaurant is not a beach, a waterfront restaurant is not a night cruise, a breakfast counter is not a date dinner, a bar is not a performing-arts show, a hotel is not an attraction), the universal serviceability refusals, and — per surface — a qualifying candidate buried below the broad-category cap proven reachable identity-first and UNREACHABLE cap-first in the same run.

- `lunch-break`: buried at corpus index 1499 of 1540; identity-first admits 41, cap-first admits 40 and never the buried row
- `night-out`: buried at corpus index 1499 of 1540; identity-first admits 41, cap-first admits 40 and never the buried row
- `birthday`: buried at corpus index 1499 of 1540; identity-first admits 41, cap-first admits 40 and never the buried row


## Watchlist — the same shape, not repaired in this pass

A systemic audit fails by producing a clean report that quietly covers a smaller system than the
reader thinks. These are written down for that reason.

**`app/api/intent-candidates/route.js:70`**

- the cut: per-category top-400, then a GLOBAL `places.slice(0, limit)` (400, max 600) by raw Wayfind Score before any rail identity runs
- what it costs: a niche venue that did not crack the global top-400 by score is invisible to every rail that would have wanted it
- why it was left: its consumers apply their own identity downstream, and its largest consumer — Night Out — now has its own identity-first route, so this is the client's fail-soft fallback rather than the shipped answer

**`lib/inventoryBoxBatch.js:93`**

- the cut: a consolidated union read across a metro cluster's WIDE boxes with `limit = min(1000 * cities, 20000)` and NO `order=`
- what it costs: a cluster whose union exceeds the limit is ranked over an arbitrary heap slice, so the same query returns a different top list after any UPDATE
- why it was left: it is a hot path feeding the landing pools, where the sub is always 'all' and no narrow identity follows — the damage is nondeterminism rather than starvation, and it deserves its own change with its own measurement

**`lib/railsData.js:993-994`**

- the cut: buildIdentityPool for breakfast and quickeats passes no `typeOv`, so its tier-2 read has no category or type filter at all: every row in the box, ordered by review count, top 300, and only then isBreakfastPlace / isQuickService
- what it costs: a genuine breakfast cafe with modest review count, in a dense box holding 300 more-reviewed rows of any category, never reaches the predicate
- why it was left: ordered (so deterministic) and on a small radius, and it sits inside the rail-menu compute where a change needs its own latency measurement

**`lib/nearbyPool.js:258`**

- the cut: `limit=400` per ring ordered by review count, with identity applied after the read but before any further cut
- what it costs: a long-tail identity match outside the 400 most-reviewed rows of a dense ring is still excluded
- why it was left: identity already runs before every count-based cut, and the ring ladder widens when the identity-passed count is short — the mildest form of the shape

**`app/api/date-night/route.js`**

- the cut: not a retrieval bug — the `shopping` rail is declared in DATE_NIGHT_RAIL_DEFS but no `shopping` category is ever read, so it can never populate
- what it costs: one Date Night rail is permanently empty everywhere
- why it was left: found by this audit, fixed separately: adding a read is a product change, not a retrieval fix

**`app/api/today-discovery/route.js`**

- the cut: not a retrieval bug — the Instagram rail's evidence is a curated creator-video set, and the places carrying it are still reached only through the broad food/nightlife/hotels/shopping reads
- what it costs: an Instagram-corroborated place outside the top 400 of its category is invisible to the rail built for it
- why it was left: the honest fix is an exact place-id read for the curated set, like Birthday's rewards, which is a small change with its own proof

## Raw reads with no `order=`

An unordered `limit=` read returns an arbitrary slice in Postgres heap order, which any UPDATE reshuffles. It is the upstream half of the bug and it is invisible: the same query returns a different answer tomorrow and nothing goes red.

- `app/api/city/unlock/route.js:71` — limit=400
- `app/guides/[slug]/page.js:71` — limit=5
- `app/guides/[slug]/page.js:123` — limit=5
- `app/guides/[slug]/page.js:263` — limit=${Math.max
- `lib/dealsData.js:114` — limit=8
- `lib/inventoryBoxBatch.js:93` — limit=${limit}
- `lib/inventoryServe.js:268` — limit=1000

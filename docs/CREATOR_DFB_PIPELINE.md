# Disney Food Blog (@disneyfoodblog) — creator intake pipeline

Started 2026-08-25 (owner-supplied research batch). DFB is a 16k+ post Disney
dining publication; the public web index exposes only a slice of its
permalinks, so this intake ships in verified phases instead of pretending a
hand-built list is "all."

## The rule (same one lib/creatorVideos.js enforces for every creator)

A place enters `lib/creatorVideos.js` ONLY with the exact post permalink,
verified open. Coverage-confirmed-but-permalink-unknown stays HERE, in the
queue. No entry cites a guessed URL, and no caption reuses DFB's words —
captions are Wayfind's own (copyright + duplicate-content rule at the top of
creatorVideos.js).

## Shipped (Phase 1)

| Place | Area | Post | Verified |
|---|---|---|---|
| Summer House on the Lake | Disney Springs West Side, Lake Buena Vista | instagram.com/p/Dcb6L0nt9tZ/ | 2026-08-25 — permalink from the owner's screenshot, corroborated by the account's public index; the six-layer chocolate chip cookie cake is on the restaurant's own current menu. |

Also assigned in `lib/creatorArchetypes.js` (`disneyfoodblog`, food_expert,
provisional:true — one spot is not a corpus; revisit with Phase 2).

## Queued — coverage confirmed, permalink NOT yet extracted

Do not promote any of these without the exact post URL.

| Place | Area | What DFB covered |
|---|---|---|
| The Cake Bake Shop by Gwendolyn Rogers (restaurant) | Disney's BoardWalk | Caramel Corn Chocolate Cake; repeated restaurant reviews |
| The Cake Bake Shop Bakery | Disney's BoardWalk | Cookie-dough cake, Millionaire Cake, cheesecake bars, macarons |
| Olivia's Cafe | Disney's Old Key West Resort | Brunch: SPAM-cheddar biscuits, omelets, banana bread pudding |
| Casey's Corner | Magic Kingdom | Baseball Brownie + full restaurant review |
| Gideon's Bakehouse | Disney Springs | Cookies, cakes, cold brew, Hot Cookie Hour, limited editions |
| EPCOT Food & Wine 2026 coverage | EPCOT | "9 major changes" post, Aug 23 — EVENT coverage: belongs on the wf_events row (epcot-food-wine-2026), not in the place registry |

## Phase 2 — programmatic extraction

Owner signed up for Sociality (account: info@gowayfind.com) on 2026-08-25 to
pull the account's media programmatically instead of chasing 16k posts through
whatever Google indexes. The target output is a structured
`place → post → permalink` dataset; each row then passes the same two gates
before entering creatorVideos.js: (1) permalink opens and matches the place,
(2) the dish/claim is checkable against the venue's own materials. Start with
the top 25 Florida spots DFB repeatedly recommends.

## Why this account matters

DFB is the highest-reach food creator relevant to Wayfind's Orlando surface,
and Orlando is the traffic center of the whole site. Place-level creator
evidence ("Featured by Disney Food Blog → the actual post") is the same credit
pattern every other creator in the library gets, and it compounds: each
verified row strengthens the detail sheet, the creator page, and the trending
surface at once.

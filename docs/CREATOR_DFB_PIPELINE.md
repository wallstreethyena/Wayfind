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

## Verified follow-up, 2026-10-13

Two previously queued subjects now have inspected native posts and exact existing database identities, prepared for publication:

| Subject | Native post | Exact association |
|---|---|---|
| Gideon's Bakehouse, Disney Springs | https://www.instagram.com/p/DZATY0ZkaR5/ | Existing OPERATIONAL Disney Springs inventory ID `ChIJPd6UAfJ_3YgRP-V0GS5jS8I`; do not use the same-name East End branch. Original caption describes a historical food feature without a current hours/menu promise. |
| EPCOT Food & Wine 2026 | https://www.instagram.com/p/DcZS_9jks2n/ | Exact existing event key `epcot-food-wine-2026`; public route `/florida-events/epcot-international-food-and-wine-festival-2026`. A festival news carousel, not a claim of event footage; absent from the place registry. |

The two source subjects above are no longer in the unextracted queue. Local code preparation is not proof of a deployed attachment.

## Held subjects — source or exact card identity still needed

Promote only with an inspected native source and the exact reviewed venue identity. Current holds are recorded below the table.

| Place | Area | What DFB covered |
|---|---|---|
| The Cake Bake Shop by Gwendolyn Rogers (restaurant) | Disney's BoardWalk | Caramel Corn Chocolate Cake; repeated restaurant reviews |
| The Cake Bake Shop Bakery | Disney's BoardWalk | Cookie-dough cake, Millionaire Cake, cheesecake bars, macarons |
| Olivia's Cafe | Disney's Old Key West Resort | Brunch: SPAM-cheddar biscuits, omelets, banana bread pudding |
| Casey's Corner | Magic Kingdom | Baseball Brownie + full restaurant review |

The Cake Bake restaurant, Cake Bake bakery and Casey's Corner now have attributable native posts, but their exact existing inventory IDs were not found in the read-only database audit. Their reviewed sources are respectively `https://www.instagram.com/p/DeSRAJ1EhW2/`, `https://www.instagram.com/p/DcYoVW-GwHR/`, and `https://www.instagram.com/p/DcbQ6EKkTda/`. The bakery video supports bakery context; do not collapse it into the restaurant identity. These remain held until exact identity/card review, rather than being attached to a similarly named venue.

Olivia's original brunch-dish source remains unresolved. A dated DFB menu-news alternate, `https://www.instagram.com/p/DcWvff6AdDh/`, mentions Olivia's Cafe, but it is a roundup without proof of a filmed visit. Stored place ID `ChIJAcphlZd_3YgRVnw4XgEUJoY` has no `wf_inventory` row in the checked sources; a usable card is not claimed. No source's old brunch wording establishes today's service schedule.

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

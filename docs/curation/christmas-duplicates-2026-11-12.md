# Christmas duplicate sweep, 2026-11-12

Owner directive (Astra brief, 2026-11-12): fix the duplicate Surfing Santas card, then find and prevent similar duplicates across the Christmas inventory, without merging distinct events.

## What was wrong

/christmas-in-florida showed 662 cards. 28 events were listed twice: a `wf_events` row (mostly from the 2026-10-27 weekly discovery run) and the same event from the October research packet, never linked in `CHRISTMAS_DB_RESEARCH_IDS`. Every pair was exactly one database row plus one research row.

The pool was rebuilt locally through the same code the page uses (`christmasBrowseCached` over live `wf_events`), so the counts match production.

## Resolution

Each database row now claims its research twin. The page shows one card under the database id, which keeps its page, slug, reels, ticket link and analytics id. The research id's old `/florida-events/<id>` URL answers a permanent redirect to the surviving page (`CHRISTMAS_CLAIMED_RESEARCH_TARGETS`), only when that page resolves.

Result: 662 cards before, 634 after. The 28 removed cards are exactly the 28 research twins, and no database card was lost. Single day events gained an end date. Two cards (Cocoa/Rockledge parade, Venice Mayor's Hometown Christmas) gained a real venue photo in place of a placeholder.

DeFuniak Springs Christmas Reflections: the research said dates unannounced, while the database row was re-verified on 2026-11-10 against the city page (day after Thanksgiving to New Year's Eve, nightly 5:30 to 9 PM CT). A research update (`lib/christmasResearchUpdates2026.js`) records the verified dates so the link keeps them.

| wf_events id (kept) | research id (folded) |
|---|---|
| surfing-santas-of-cocoa-beach-2026 | surfing-santas-cocoa-beach-2026 |
| fishermens-village-holiday-festival-of-lights-2026 | fishermens-village-festival-of-lights-2026 |
| holiday-light-display-dorothy-b-oven-park-2026 | tallahassee-oven-park-lights-2026 |
| beach-home-for-the-holidays-panama-city-beach-2026 | beach-home-for-the-holidays-2026 |
| seaside-holiday-parade-turn-on-the-town-2026 | seaside-turn-on-the-town-2026 |
| fantasy-lights-festival-palm-coast-2026 | fantasy-lights-palm-coast-2026 |
| holiday-house-and-stroll-fort-myers-2026 | fort-myers-holiday-house-stroll-2026 |
| martin-county-christmas-boat-parade-2026 | martin-boat-parade-2026 |
| vero-beach-christmas-boat-parade-2026 | vero-boat-parade-2026 |
| cocoa-rockledge-holiday-parade-2026 | cocoa-rockledge-parade-festival-2026 |
| christmas-reflections-defuniak-springs-2026 | christmas-reflections-defuniak-2026 |
| the-mayors-hometown-christmas-venice-2026 | venice-mayors-hometown-christmas-2026 |
| lake-worth-beach-holiday-tree-lighting-2026 | lwb-tree-lighting-2026 |
| light-up-the-night-punta-gorda-tree-lighting-2026 | punta-gorda-light-up-the-night-2026 |
| luminary-holiday-stroll-sanibel-2026 | sanibel-luminary-holiday-stroll-2026 |
| tavares-christmas-parade-and-festival-2026 | tavares-christmas-parade-2026 |
| lake-worth-beach-holiday-parade-2026 | lwb-holiday-parade-2026 |
| key-west-art-and-historical-society-holiday-concert-and-bazaar-2026 | key-west-custom-house-concert-bazaar-2026 |
| christmas-on-the-coast-port-st-joe-2026 | port-st-joe-christmas-on-the-coast-2026 |
| holiday-on-the-harbor-carrabelle-2026 | carrabelle-holiday-on-the-harbor-2026 |
| christmas-island-style-street-parade-marco-island-2026 | marco-street-parade-2026 |
| st-lucie-county-christmas-boat-parade-2026 | st-lucie-boat-parade-2026 |
| christmas-boat-parade-on-naples-bay-2026 | naples-bay-christmas-boat-parade-2026 |
| enchanted-forest-of-trees-clermont-2026 | clermont-enchanted-forest-2026 |
| pslinlights-at-the-port-2026 | pslinlights-port-2026 |
| port-st-lucie-festival-of-lights-2026 | psl-festival-of-lights-2026 |
| marianna-christmas-in-wonder-land-2026 | marianna-christmas-in-wonderland-2026 |
| allison-christmas-spectacular-2026 | havana-allison-christmas-spectacular-2026 |

## Kept apart on purpose

Twenty look-alike pairs were reviewed and are different experiences, recorded in `REVIEWED_DISTINCT` (`lib/christmasTwins.js`). Examples: three Tampa boat parade cruises on different boats, a city's season display vs its lighting night, Universal's resort season vs one park's parade, St. Pete's Santa in the Park vs a movie night on the same city page. An automatic merge rule was tested and rejected because it joined several of these.

## Prevention

* `lib/christmasTwins.js`: a detector that FLAGS suspected twins (same city and day, plus the same official page or near identical name). It never merges.
* `scripts/test-christmas-twins.mjs` (prebuild): all 28 links hold, each merge yields one card, each old URL redirects one hop, detector positive and negative controls, and the research file has no unreviewed twins.
* `scripts/check-christmas-twins-live.mjs`: runs the detector over the live page data every 30 minutes (inside the canary's inventory integrity step) and fails on any repeated card id or unreviewed twin, with the exact fix in the message. Red-proved by removing the Surfing Santas link (FAIL, exit 1).

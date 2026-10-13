# Instagram creator intake, 2026-10-09

Owner request (2026-10-09): put 12 Instagram reels on the matching place cards.

## How each link was verified

- Caption, creator and venue tag of every reel were read in the owner's
  signed-in Instagram browser.
- Each venue was opened on its own Google Maps listing to confirm name,
  address and the listing's own Google id (a free browser read, no paid
  Places lookup). Eight venues were already in `wf_inventory`; their stored
  ids matched the Maps listing exactly.
- Captions are Wayfind's own words and claim only what the reel shows. No
  prices, dates or ratings.

## Added (12 videos on 12 venues)

| Entry key | Venue | Creator | Reel |
|---|---|---|---|
| roosters-cigars-coffee-tampa (existing, gained its id) | Roosters Cigars and Coffee, 3103 N Howard Ave, Tampa | whenintampa | DeRYw2uRipy |
| raglan-road-disney-springs (existing) | Raglan Road Irish Pub, Disney Springs | paigepbryant | DeQUPZfRerz |
| american-victory-ship-tampa | American Victory Ship & Museum (UNDead in the Water), 705 Channelside Dr, Tampa | cailincoastal | DePfI-oNYs- |
| zymarium-meadery-orlando | Zymarium Meadery (Dark Ritual pop-up), 1121 N Mills Ave, Orlando | happyhourevan | DeNREzjBf1V |
| space-220-epcot-orlando | Space 220 Restaurant, EPCOT | herewithsuha | DdlyvQwRh-X |
| strandhill-public-tampa-heights | Strandhill Public, 309 W Palm Ave, Tampa (address from the account's own bio) | strandhillpublictampa | DePeTZRuYDC |
| st-pete-pier-st-petersburg | St. Pete Pier pumpkin patch, 600 2nd Ave NE | tampabayisawesome | DeNdCoXho-Q |
| giancarlos-tampa | Giancarlo's, 1532 W North B St, Tampa (Sidebar at G's lives inside it, per its bio) | sidebaratgs | DeQLB2aAbqY |
| jojos-shake-bar-orlando | JoJo's Shake Bar, 9101 International Dr, Orlando | faraheatss | DeMldAhRk3h |
| wells-hollow-creamery-shelton | Wells Hollow Creamery, 5 Beard Sawmill Rd, Shelton, CT | thesummerweenclub | DeDO3lxivN- |
| a-petrified-forest-altamonte-springs | A Petrified Forest Scare Trail, 1360 E Altamonte Dr | paigepbryant | DeNKb2oMiGn |
| v-modern-italian-tampa | V Modern Italian, 1701 W North A St, Tampa | tastetravelunravel | DePo5O7ogQj |

## Trending integrity

Venue and aggregator accounts never count toward the "2+ creators" trending
floor: `strandhillpublictampa`, `sidebaratgs`, `tampabayisawesome` and
`raglanroadpub` were added to `lib/creatorIndependence.js`. Raglan Road was
the one that mattered: its second video would otherwise have let the pub's
own reel count as an independent voice.

## Inventory rows added (owner-approved in chat, 2026-10-09)

Four venues were not in `wf_inventory`, so their cards could not open:
Roosters Cigars and Coffee, Giancarlo's, V Modern Italian (Tampa) and Wells
Hollow Creamery (Shelton, CT). The owner approved adding all four. They were
inserted insert-only with `source = 'creator_curation'`; the exact statement
and its reverse are in `instagram-2026-10-09-inventory.sql`. Coordinates are
US Census exact address matches; rating and review count are read off each
Google Maps listing. After the insert, `/api/places/details` serves all four
from inventory (no paid lookup).

The older Roosters reel (`Dc3Vjs7hCYo`) now resolves by the verified id too,
so its record in `social-attachment-audit.json` moved from the name-only
creator preview to `/p/ChIJzzp4zxPDwogRuP2urL4IRTc`.

## Not done here (needs owner approval: production data writes)

Several reels are dated seasonal runs that would also make good `wf_events`
rows (UNDead in the Water, Dark Ritual, St. Pete Pier Pumpkin Patch, Sidebar
Circus, JoJo's pumpkin patch, Raglan Road Halloween). Those are not inserted.

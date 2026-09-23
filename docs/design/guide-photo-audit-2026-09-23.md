# Guide photo audit: close-out record (2026-09-23)

The owner-approved record that closes the guide photography audit shipped in #1453 and #1458.
Business photo permissions are tracked separately from here on.

## Result

- 45 of 45 guides audited on production, at a 390px phone view and a 1440px desktop view.
- 26 guides fully photographed: every numbered pick that is a real place shows a real photo
  (its own credited photo or its place card's photo), and the hero is a real photo.
- 14 hero photos added; no guide is missing a hero. Two guides (birthday-freebies-bradenton-sarasota,
  sarasota-half-price-dining) keep an owner-approved hero labelled "Illustrative photo" because
  they cover many businesses with no single place to show.
- 173 numbered picks carry a real photo of that exact place.
- 33 real-place picks still have no photo on the live page. Every one is listed, with its reason, in
  `data/guide-pick-photos/<slug>.json` (`gaps`) and `data/guide-pick-photos/_reports/<slug>.csv`.

## Licence evidence

`data/guide-pick-photos/_reports/license-evidence.json` holds one row per photo file added by the
pick-photo pipeline (183 files, 187 uses: 173 picks and 14 heroes). Each row stores what the SOURCE
says (page URL, title, author, date taken, licence, re-read from the Commons API or the live Flickr
page) next to what Wayfind renders (credit, licence, deed URL, modification notice), and whether the
licence allows commercial use. All 183 rows are `verified`; every licence is CC0, CC BY or CC BY-SA
(2.0 to 4.0), all of which allow commercial use with attribution.

Re-run `node scripts/build-guide-photo-license-evidence.mjs` whenever photos change.
`scripts/check-guide-pick-photos.mjs` (section 11) fails the build if any photo on the site has no
verified row, or if its credit, licence, deed URL or notice changed after verification.

The re-check found and fixed three wrong records:

| Photo | What was wrong | Fix |
|---|---|---|
| Bern's Steak House (things-to-do-in-tampa-florida) | recorded as CC BY 3.0; the Commons page's only licence is CC BY-SA 3.0 | licence, deed URL and share-alike notice corrected |
| Homosassa Springs entrance (swim-with-manatees-crystal-river) | credited to the Commons uploader (Ebyabe); the photographer is Paul Clark | credit corrected |
| Fifth Avenue South (things-to-do-naples-summer-2026) | recorded as CC0; the Commons file is PD-self, a public-domain release outside the pick contract | replaced with a CC BY 2.0 Flickr photo of the Inn on Fifth, same street |

## Business outreach list

A yes from any of these fills a real-place gap that has no photo today. 25 businesses cover
24 picks: Gecko's covers two picks, and two picks can be filled by either of two businesses.

| # | Business | Guide | Pick |
|---|---|---|---|
| 1 | Ulta Beauty (Bradenton store) | birthday-freebies-bradenton-sarasota | Ulta Beauty: birthday gift plus double points |
| 2 | Green Meadows Petting Farm | fall-events-orlando-2026 | Green Meadows Farm Fall |
| 3 | The Abbey Orlando | fall-events-orlando-2026 | Candlelight: A Haunted Evening of Halloween Classics |
| 4 | Wild Florida Airboats and Wildlife Park | gatorland-vs-wild-florida | Wild Florida: the airboat experience |
| 5 | Gecko's Grill & Pub | sarasota-half-price-dining | Gecko's Grill & Pub; Bar Bingo at Gecko's Hillview |
| 6 | Pie On Main | sarasota-half-price-dining | Pie On Main |
| 7 | Shore, St. Armands Circle | st-armands-circle-restaurants | Shore |
| 8 | Pier Sixty-Six Hotel & Marina | things-to-do-fort-lauderdale-summer-2026 | Pier Sixty-Six and the rotating Pier Top |
| 9 | The FORT pickleball stadium | things-to-do-fort-lauderdale-summer-2026 | The Fort, the world's first pickleball stadium |
| 10 | Peppi's Pizza | things-to-do-fort-lauderdale-summer-2026 | Peppi's Pizza after the One Bite review |
| 11 | The Reserve Key West | things-to-do-key-west-summer-2026 | The Reserve, the new bank takeover |
| 12 | Papa's Pilar Distillery | things-to-do-key-west-summer-2026 | Papa's Pilar rum distillery |
| 13 | Balloon Museum (Mana Wynwood) | things-to-do-miami-summer-2026 | Balloon Museum at Mana Wynwood (exhibition ends September 27) |
| 14 | Inter Miami CF | things-to-do-miami-summer-2026 | Inter Miami at Miami Freedom Park |
| 15 | Joia Beach | things-to-do-miami-summer-2026 | Joia Beach Club on Watson Island |
| 16 | The Perry Hotel Naples | things-to-do-naples-summer-2026 | Tigress at The Perry Hotel |
| 17 | FC Naples | things-to-do-naples-summer-2026 | An FC Naples match night |
| 18 | Level99 Disney Springs | things-to-do-orlando-summer-2026 | Level99 at Disney Springs |
| 19 | Shipwreck Island Waterpark | things-to-do-panama-city-beach-summer-2026 | Shipwreck Island Waterpark |
| 20 | Boondocks | things-to-do-panama-city-beach-summer-2026 | The TikTok food crawl (either 20 or 21) |
| 21 | Coco Loco | things-to-do-panama-city-beach-summer-2026 | The TikTok food crawl (either 20 or 21) |
| 22 | Outback Crab Shack | things-to-do-st-augustine-summer-2026 | The crab-boil giants (either 22 or 23) |
| 23 | Crabby's Beachside | things-to-do-st-augustine-summer-2026 | The crab-boil giants (either 22 or 23) |
| 24 | Central Park food hall (St. Petersburg) | things-to-do-st-petersburg-clearwater-summer-2026 | Central Park, the new five-story food hall |
| 25 | BayCare Sound | tonights-move-tampa-september-12-2026 | MORFLOW FEST (a past, dated event) |

The other 9 real-place gaps have no business to ask. Seven are public land, where the agency that
runs it could share a photo (optional): Manatee County (Robinson Preserve kayak trails), U.S. Fish and
Wildlife Service (Three Sisters Springs boardwalk), City of Key West (temporary Southernmost Point
buoy), Rookery Bay Reserve / Conservancy of Southwest Florida (Keewaydin Island), City of Panama City
Beach (Aaron Bessant Park), Florida State Parks (Buccaneer Bay) and City of Fort Lauderdale (Las Olas
Beach). Two are tours sold by several operators (clear-kayak bioluminescence tour, guided scallop
trip). Each gap's `needsPermissionFrom` in the data files now matches this list.

A further 55 picks show a Google photo on their place card; the card already gives readers a photo, so
asking those venues is optional. They are in the per-guide CSV reports with reason `google-only`.

## Future replacement candidates

Kept because the caption discloses the year, but not permanently solved. Listed in
`data/guide-pick-photos/_reports/replacement-candidates.json` and carried into the licence ledger.

| Photo | Taken | Why replace later |
|---|---|---|
| Gatorland alligator-mouth entrance | 2002 | paint and surroundings may have changed |
| Sunglow Pier with Crabby Joe's | 2008 | the pier was damaged by later hurricanes |
| Caladesi Island ferry | 2011 | the boat in service today may differ |
| Inn on Fifth, Fifth Avenue South | 2005 | added in this close-out; the street has changed since |

## Temporary server errors during the production check

During the 90 page-view production check (2026-09-23, about 11:36 to 11:50 UTC) the test browser
logged HTTP 502 responses on 11 page views across 10 different guides. One was the page itself
(anna-maria-island-day-trip, phone); the other 10 were a background resource on a page that otherwise
rendered, and two of those pages (things-to-do-sarasota phone, best-hotels-near-magic-kingdom desktop)
had one lazy pick image still loading when it was captured. Only best-hotels-near-magic-kingdom
appeared in both views of that run; no route failed again afterwards.

They were transient and did not come from Wayfind:

- Wayfind's Vercel production logs for 11:30 to 12:00 UTC contain no 502 at all (statuses 200, 302,
  204, 404, 400 and one 503 on `/api/summer/places`, an endpoint no guide page calls).
- The three routes that tripped checks passed an immediate re-run, and then 30 more loads
  (5 per route at phone and desktop) with zero server errors and every photo loaded.
- The test browser ran behind the cloud workspace's network proxy, which reported dropped tunnels
  (`ws_closed_mid_exchange`) during the same run.

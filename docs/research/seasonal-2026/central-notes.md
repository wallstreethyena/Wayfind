# Central Florida seasonal hospitality research

Checked 2026-10-18. Research dataset only; no product code, repository data, Google Places calls, Disney reservation calls, or remote changes made.

## Counts and limits

86 unique name/city records: 68 confirmed 2026, 6 verified permanent themed venues, 11 pending 2026, 1 excluded/closed. Count qualified venues only as `confirmed_2026` or `permanent_verified`: 74 total.

| Area | All records | Qualified physical venues | Pending | Excluded | Gap to 50 qualified |
| --- | ---: | ---: | ---: | ---: | ---: |
| Orlando/Central vicinity | 70 | 59 | 10 | 1 | 0 |
| Central east coast | 7 | 6 | 1 | 0 | 44 |
| Ocala | 6 | 6 | 0 | 0 | 44 |
| Lakeland | 3 | 3 | 0 | 0 | 47 |

The Orlando result does not imply 50 each for Melbourne, Daytona Beach, Ocala or Lakeland. East-coast breadth consists of Melbourne (2), Cocoa Beach (2), Daytona Beach (1 qualified plus 1 pending), Daytona Beach Shores (1). Cocoa city and Treasure Coast cities have no qualified additions in this pass. New search leads in Vero Beach mostly resolved to generic event aggregators, parades or markets rather than qualifying hospitality venues; none padded into count. East-coast, Ocala and Lakeland searches were a late scope expansion and remain a partial sweep, not a saturation claim.

Street addresses are incomplete for some large-campus restaurants and several independent cafes. Those fields preserve verified campus/neighborhood identity, with missing street precision noted. All Google place IDs are null. These records are not ready for automated ingestion until address/ID matching is completed. No identifier was invented. Orlando includes distinct suburban cities in city fields (Winter Park, Maitland, Winter Garden, Casselberry, Tavares, Lake Buena Vista, Golden Oak, ChampionsGate and Apopka); it does not relabel them Orlando.

## Counting rules

One row per physical hospitality establishment. Menu dishes are never separate venue rows. Aku Aku/The Dust combined conservatively at one address; Velvet/Veranda combined; resort-level rows not added on top of hotel outlet rows. Gideon's Disney Springs chosen instead of counting its less immersive East End walk-up. Single branches selected for Glass Knife, Salty, Foxtail, Jeff's, First Watch and Starbucks. The Shores hotel combines its multiple holiday programs into one venue. Its disparate dates are explained in notes, rather than a false continuous run.

The Universal article explicitly supports separate barVentura/Bar17, Swizzle/Galaxy Bowl, and Sapphire satellite bar/Strong Water Tavern; those are actual distinct service outlets, not duplicate hotel rows. The satellite lobby bar is seasonal, so its branded identity and ID need venue matching. Even removing the seasonal satellite bar, Galaxy Bowl and small Prometheus coffee counter leaves Orlando above50 qualified venues.

## Main sources and verification references

- Disney Parks Blog 2026 Disney Springs food guide: https://disneyparksblog.com/wdw/disney-eats-foodie-guide-to-halloween-at-disney-springs/ — primary, retrieved and opened repeatedly at relevant venue sections (`turn5view1`, `turn7view1`, `turn10view3-5`, `turn12view0-4`, `turn19view3-6`, `turn38view1-5`). 21 distinct venues retained with one representative menu item each. Generic Rainforest/T-Rex pot-roast/pork-chop items and unspecified Outdoor Bars omitted as weaker fits. Specific menu names were kept only where read. An undated Ganachery run retains null dates.
- Universal's official article, published Oct15,2026: https://blog.discoveruniversal.com/hotels/sip-between-scares-themed-universal-hotel-bars/ (`turn7view2`, `turn10view2`, `turn12view7`). Twelve distinct dining/bar outlets. Season endpoint Nov1 corroborated by Visit Orlando; precise recurring opening days not inferred.
- Visit Orlando 2026 bar takeover guide: https://www.visitorlando.com/blog/post/boos-brews-best-halloween-bar-takeovers/ (`turn10view0`, `turn12view5`). Supplies dated Courtesy, Mangoni, Zymarium, Dead Coconut and hotel programs. It contradicts itself for Eden Bar by labeling October2026 while saying details forthcoming; Eden is conservatively pending.
- Orlando Date Night Guide updated Oct12,2026: https://www.orlandodatenightguide.com/halloween-cocktails-bars-in-orlando-25039/ (`turn10view1`, `turn12view6`, `turn19view7`). Local physical addresses, Forward/Slasher, Helena, Colorado Fondue, Aku Aku, Judson's and Permanent Vacation. Endpoint precision not invented from “October.”
- Official Apothecary: https://www.brutaphouse.com/spookeasy/ (`turn29view4`). Opens Sep5,2026; final service Oct31 OR Nov1. Secondary says Sep4; official Sep5 chosen. end_date remains null. Walk-ins only; cocktails including spirit-free are21+.
- Official Four Seasons release: https://press.fourseasons.com/orlando/hotel-news/2026/epilogue-halloween-popup-speakeasy/ (`turn68view0`). Sep17-Oct31, Thursday-Saturday, advance tickets. Source postal address uses Orlando; actual community Golden Oak retained.
- Official Rosen Sep2026 release: https://www.rosenhotels.com/rosen-hotels-resorts-unveils-a-happy-hour-full-of-spooky-sips/ (`turn29view3`). Three distinct lounges. Exact service dates unannounced; outlet at6327InternationalDrive kept as Lounge at Rosen Inn closest to Universal instead of asserting an unverified branded name.
- Fall2026 independent menus: https://www.gottagoorlando.com/post/where-to-find-the-best-pumpkin-spice-eats-and-treats-in-orlando-this-fall (`turn47view4`). JoJo's, NY Beer Project, Glass Knife, Salty; Foxtail participation at precise chosen storefront remains pending.
- Official First Watch Winter Park local menu: https://firstwatch.com/locations/winter-park (`turn38view7`), with dated nationwide release https://firstwatch.com/first-watch-debuts-new-fall-menu (`turn38view6`). Local pumpkin items explicit, Aug18-Oct26,2026. Release excludes Tampa Bay; Winter Park not excluded.
- Jeff's2026 menu brand release reprinted by Bake Magazine https://www.bakemag.com/articles/21930-jeffs-bagel-run-to-kick-off-pumpkin-season (`turn33search0`). Actual O-Town West address official: https://www.jeffsbagelrun.com/locations/fl/orlando-o-town-west (`turn91search0`). Branch participation not independently verified, so pending.
- Official Starbucks2026 national menu https://about.starbucks.com/stories/2026/fall-starts-with-starbucks/ (`turn91search1`). Thornton Park branch address secondary, local seasonal participation unverified; pending.

## Christmas evidence discipline

Official2026 Miracle location list https://www.miraclepopup.com/locations-2026 (`turn29view0`) confirms The Courtesy/Miracle on Orange and Crafted Concoctions/Miracle on Main. Same physical rows already counted for Halloween; Christmas start/end not published in the viewed list, so not invented.

The popular Orlando Christmas roundup https://www.orlandodatenightguide.com/holiday-bars-christmas-cocktails-25330/ is dated Dec25,2025 (`turn29view1-2`, `turn77view0`). It is NOT evidence of a2026 run merely because older dates extend into January2026. Shark Bar, Eagles Edge/Blitzen's, Wellborn, Mathers, Otto's and Shade House kept pending2026 with null dates and no rolled-forward menu. Existing rows for Colorado Fondue, JoJo's, Red Coconut, Eden and Permanent Vacation mention historical Christmas evidence in notes only. Historical Christmas offerings are not included in the confirmed seasonal menu claims.

The Shores official2026 page is current confirmed Christmas evidence: Christmas cocktail program Dec13-24 and Santa breakfast Dec5. https://www.shoresresort.com/holidays-at-the-shores/ (`turn72view3`, `turn76view4`). Actual city Daytona Beach Shores, not Daytona Beach proper.

## Expanded markets

- Melbourne: Meg O'Malley's primary Halloweekend page https://www.megomalleys.com/event/megs-halloweekend-fri-oct-30-sat-oct-31/ (`turn75view1`) confirms Oct30/31 nights, blood bag cocktail and shot flight. City tourism corroboration `turn72view4`.
- Melbourne: Apocalypse direct current Toast menu https://order.toasttab.com/online/apocalypsecoffee/item-pumpkin-king-breve_2851c034-96a7-4029-a9f4-2b2e9cca53db (`turn76search1`) has actual fall/October specials, not name-only qualification. Address from direct Toast https://toast.app/r/apocalypsecoffee/order (`turn76search13`). Current live menu verified; undated heading, no invented year-specific run dates.
- Cocoa Beach: Longboards organizer Eventbrite https://www.eventbrite.com/e/luau-of-the-lost-a-haunted-tiki-halloween-party-tickets-2000666466257 (`turn76search3`) dated Oct31,2026; official venue search result also surfaced party (`turn74search2`), street address official (`turn75view0`). Some calendar content absent from parsed full page, preserved in notes.
- Cocoa Beach: Zero Gravity primary https://www.zerogravitywinebar.com/ (`turn77view1`) current Halloween wine collection and Oct29,2026 charcuterie class. Exact address direct.
- Daytona Beach: tourism Hog-O-Ween https://www.daytonabeach.com/event/hog-o-ween-at-the-hard-rock-hotel-daytona-beach/55806/ (`turn76view2`) confirms Oct31,2026, AvalonI ballroom, specialty cocktails, physical address. RAD Kava's BULAWEEN search listing found but full page429; pending.
- Ocala: Katya primary fall2026 menu https://katyavineyards.com/cocktails/ (`turn72view5`). Official contact page conflicts101Evs11ESilverSpringsBlvd (`turn76search2`); keep neighborhood address pending resolution, do not choose a conflicting street number.
- Ocala: local newspaper Sep7,2026 https://352today.com/news/257752-pumpkin-spice-and-everything-nice-local-places-to-find-fall-flavors-in-the-352/ (`turn72view8`) documents Betty Cakes, Chelsea Coffee, Gathering Cafe, Soleil and Symmetry, with addresses. Only Soleil vegan pumpkin rolls explicitly confirmed this year; historical other Soleil products omitted.
- Lakeland: Eaglebrooke primary Halloween buffet https://www.eaglebrooke.com/event/spooktacular-halloween-buffet/ (`turn74view0`) and official2026calendar (`turn68search29`) fix year. Actual themed dishes, Oct30.
- Lakeland: Black&Brew2026 LALtoday article retrieved via search (`turn75search11`, `turn74search0`); full parser one line. Distinct downtown branch chosen, no branch multiplication.
- Lakeland: Concord Coffee at hospital local reporting https://www.lkldnow.com/code-brew-concord-coffee-brings-craft-drinks-to-new-hospital/ (`turn77view3-4`) updated Sep30,2026. Owner confirms pumpkin spice at all stores; hospital specific address explicit. Public visitors can enter after check-in.

## Exclusions and next actions

Cocktails & Screams is reported permanently closed March2026 by https://anthemorlando.com/orlando-halloween-2026-downtown-nightlife-guide/ (`turn5search13`). Kept excluded so a historic strong theme does not become an open recommendation. No claim based only on spooky names.

No Disney forbidden domains/endpoints were requested. No paid APIs used. All links were researched with system2 first and authoritative system1/primary opens to verify gaps. Notes preserve supporting tool reference IDs, but consumer must open URLs independently when producing citations.

Next: verify local branch menus for Jeff's, Starbucks and Foxtail; obtain2026Christmas confirmations; resolve precise street addresses/Google IDs; widen east coast/Ocala/Lakeland menus across neighborhoods. These are honest research and ingestion gaps, not completed coverage.

Validation run: parsed all86 JSON rows, asserted exact18-field schema, unique name/city pairs, valid enum status, null place_ids, HTTPS source URLs, checked_at, and no forbidden Disney source host. Returned86unique records,74qualified. Repository tests not run because no implementation changed.

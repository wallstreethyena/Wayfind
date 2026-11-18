# Disney holiday food guide: editorial and release record

The park selector opens a geographic Apple map through Wayfind’s existing CreatorAppleMap component. The seven Florida pins use reviewed coordinates recorded with their sources in lib/disneyChristmasFoodLocations2026.json. The Grove pin marks the nearby theater and the Cookie Bar pin marks its host restaurant. The stop details and Maps links remain available when the embedded map cannot load. The earlier four-venue insert migration is not a prerequisite and is not applied by this work.

## Intent and contribution

- Primary query: Disney World holiday food guide 2026.
- Related intent: Christmas snacks, Animal Kingdom holiday food, Jollywood beignets and the Cookie Bar sundae.
- Geography: Walt Disney World, Orlando; four separate parks plus Disney Springs.
- Audience: families, couples and visitors choosing food around admission they already hold.
- Decision: which supplied treat belongs in which park day, where to find it, which ticket is needed, and which original post to inspect.
- Proposed canonical: `https://www.gowayfind.com/guides/disney-world-holiday-food-guide-2026`.
- Distinct contribution: one geographic map per selected park, seven Florida venues, a separate Anaheim bonus and nine in-page creator previews, an admission/price comparison and three practical outing ideas. No walking paths or measured travel times are invented.
- Existing coverage: the Disney Springs restaurant guide is broader dining coverage; the Florida Christmas theme-park guide compares events across Florida. Neither answers this food-stop/map intent. No competing Disney food guide was found in the current guide registry or open PR inventory.
- Demand and baseline: unknown. No search volume, clicks, impressions, CTR, positions, organic visits or conversion lift is inferred.

## Source and recommendation record

| Stop | Evidence | Planning fit and limits |
| --- | --- | --- |
| Terra Treats, Discovery Island | Official 2026 holiday menu plus supplied DisneyForFoodies reel | Animal Kingdom dessert; coffee/coconut flavor profile. Official Nov 6 through Jan 3 window. |
| Santa’s Holiday Grove, near Theater in the Wild | Official menu, supplied peppermint reel and DFB croissant carousel | Same Animal Kingdom day; one seasonal stop, two posts. Official Nov 13 through Jan 3 window. Official filling is hazelnut; no ganache claim is copied from creator text. |
| Epic Eats, Echo Lake | Official 2026 Jollywood menu and supplied reel | Separate event ticket; select event nights Nov 7 through Jan 5. Ordinary park admission is insufficient. |
| Main Street Confectionery | Official 2026 holiday menu and supplied reel | Magic Kingdom group snack; cookie versus peppermint choice. Item-specific final date not established. |
| San Angel Inn, Mexico Pavilion | Supplied creator reel | EPCOT dining find, age 21+ drink; current menu, service and end date not verified. No La Hacienda availability or festival affiliation asserted. |
| The Cookie Bar, Summer House on the Lake | Official restaurant menu/address and supplied creator reel | Disney Springs option without theme park admission. Venue confirmed; exact featured sundae and price not confirmed by official menu. |

Official sources checked November 17, 2026:

- https://disneyparksblog.com/wdw/disney-eats-foodie-guide-to-holidays-at-walt-disney-world-resort/
- https://disneyparksblog.com/wdw/foodie-guide-to-disney-jollywood-nights/
- https://www.summerhouserestaurants.com/disney-springs/menus/

Only Disney Parks Blog was requested for Disney menu research. No automated request was made to the Disney World website, My Disney Experience or reservation endpoints. No Google API calls, new paid APIs or database writes were needed. Price amounts are attributed to the supplied screenshots and remain explicitly unverified as current prices. Daily hours, waits, accessibility facilities and parking prices are not invented. Outing plans are editorial suggestions, not timed or optimized routes. All nine creator URLs and creator handles live with their stop records in `lib/guidesDisneyHolidayFood2026.js`.

## Image and media record

The explicit hero and guide-index record reuses `/guides/context/magic-kingdom-christmas.webp`, 1280×853, 132,964 bytes. Actual subject: Main Street’s Christmas tree and buildings at Magic Kingdom. Nearby copy identifies a past setting photograph, not the current food. Source: https://commons.wikimedia.org/wiki/File:Christmas_at_Magic_Kingdom_-_panoramio.jpg . Photographer Ivan Curra, CC BY-SA 3.0, source dimensions 4608×3456; existing resize/crop/WebP adaptation retains the license and visible credit. Asset pixels and live source/license were inspected. Desktop, phone, index and social crops are not claimed visually passed without a rendered browser observation.

Unsplash alternatives were sought, including `WTDKnUfhynE` and `RZNe_QZRi04`; the existing verified holiday setting image was retained to avoid a new download. The nine creator posts are native embeds opened on demand with direct source links, each shown behind Wayfind's own credited photo of the park where the food is sold. The California bonus has no park row, so it shows no video tile. They are not downloaded, rehosted or represented as licensed still photography. Food photo-gap records state this actual limit and name the relevant creator leads without claiming an exhaustive photo search.

## Verification

The Florida park maps use the shared Apple map and pins. A stop ID connects its pin and food section, and changing parks unmounts the previous map. Pins refer to a food venue or to its named landmark when the counter lacks a documented location. The Disney’s BoardWalk counter and Anaheim bonus are outside the mapped scope. Food artwork appears only on the creator preview controls.

Release checks and any production verification are tracked in PR #2588.

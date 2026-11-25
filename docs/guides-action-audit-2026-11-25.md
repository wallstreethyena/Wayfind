# Main-site guide actions: November 25, 2026

## Coverage and baseline

The live main-domain sitemap and direct guide HTML yielded **69 canonical, indexable guides**: 68 current registry entries plus the standalone Florida Fall Festivals 2026 guide. A further three live pages are deliberately on photo hold and served noindex: Florida Hanukkah, Snowcat Ridge vs. Wunder Glow, and Tampa Christmas Coffee and Farm Outings. The 22 past registry entries were excluded. No alias was counted. The blog host is outside this census.

At a clean 390×844 mobile viewport, the baseline gave 0 guides with a direct first-screen ticket, reservation or directions action, 2 with a useful first-screen map, and 0 with a topic-specific persistent action. Another 65 had their action only in the body; the remaining 2 had no equivalent under this rubric. Generic navigation, unrelated offers, and the “Choose Quickly” editorial jump alone did not count.

The candidate assigns 4 named purchases, 4 exact directions, 2 maps, and 59 topic-specific planning actions. In an offline Chromium fixture, the real candidate React component and CSS mounted into the corresponding 69 captured production documents; all 69 had their full action in the first 390×844 screen and a matching sticky action after scrolling past the hero. The sticky action clears the reading area at the article end; it is dismissible. This check did not run the changed pages on production, send live analytics, follow attributed redirects, invoke a checkout or buy anything.

## Exact commercial destinations

| Guide | Approved product checked without clicking the tracked redirect | Scope and availability |
| --- | --- | --- |
| Space Coast bioluminescence | [Viator 123164P2](https://www.viator.com/tours/Cocoa-Beach/Bioluminescent-Clear-Kayak-Tours-in-Titusville/d25319-123164P2) | Clear-kayak bioluminescence; listing identifies Haulover Canal in Mims as the meeting point. Original product remains attributed; button names the actual departure. Catalog link was verified; date-level inventory was not checked. |
| Myakka River State Park | [Viator 136885P3](https://www.viator.com/tours/Sarasota/Myakka-State-Park-E-bike-Safari/d25738-136885P3) | Myakka State Park E-bike Safari, not a pass or a general Sarasota tour. Catalog link was verified; date-level inventory was not checked. |
| Robinson Preserve | [Viator 454941P4](https://www.viator.com/en-GB/tours/Sarasota/Robinson-Preserve-Mangrove-Tour/d25738-454941P4) | Robinson Preserve mangrove tour; listing identifies the South Entrance launch. Catalog link was verified; date-level inventory was not checked. |
| SeaWorld Orlando Christmas Celebration | [Undercover Tourist SeaWorld Orlando Single Day Ticket](https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/) and [SeaWorld's event page](https://seaworld.com/orlando/events/christmas-celebration/) | The active affiliate entry is park admission, not a separately ticketed holiday show. SeaWorld lists select celebration dates through January 4, 2027; that offer leaves the guide January 5 even while the editorial guide remains available. Affiliate catalog link-status was unknown; the direct product was checked, but individual date capacity and the attributed redirect were not exercised. |

For known sold-out or unavailable tickets, keep the existing live availability rules and offer a planning path, not a sale. No action implies inventory. Roundups with no exact, relevant commercial destination use the named planning path, not generic city offers dressed as bookings. The original attribution is retained on the four exact offers.

## Discovery and measurement

The guide index and sitemap use the same standalone registry, so the already-happened Fall Festivals guide has a crawlable home without altering the current/archived or photo-hold rules. The guide index links to the Wayfind Blog. “Choose Quickly” jumps are rebuilt only for the picks actually shown. Two known Columbia Restaurant body directions resolve to the exact Tampa and St. Armands branches rather than a name-only search.

For the conversion funnel, group `guide_cta_impression` → `guide_cta_clicked` by `slug`, `placement`, `cta_kind`, and existing device dimension `$device_type`. An action is counted once when its hero or sticky version actually reaches 50% visibility. Both placements capture a real click; exact and monetized are separate flags. Only a paid partner action enters the existing `commerce_impression` → `commerce_cta_clicked` flow and uses an attributed partner jump. Do not combine prior body-offer history and this new first-screen funnel without distinguishing placement. No live analytics events were generated during this audit.

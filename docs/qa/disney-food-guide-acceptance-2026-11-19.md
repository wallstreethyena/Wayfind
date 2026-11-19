# Disney food guide acceptance repair · 2026-11-19

## Owner mission
Finish the Disney holiday food guide: usable separate park maps, food-pin navigation, actual food media, California source preserved, premium presentation and honest in-page playback.

## Baseline
Merged #2603 used park photos as food-tile covers. Its `placeId` gate discarded the California @eatsbynatt Reel. On production, the five park selectors worked, but direct clicks on the Flame Tree and Summer House pins did not open details. Native Instagram embeds loaded food images but offered “Watch on Instagram”; iframe load was not playback evidence.

## Repair
- Keep seven researched coordinates and the explicit Theater in the Wild / Summer House landmark qualifications. Use muted geographic Apple maps, numbered native button annotations, matching index, selected state, keyboard focus transfer, fit-all and retry. No invented paths or copied Disney map art.
- Show each dish through its native attributed post, progressively loaded only near the viewport. No park-photo substitution, unlicensed downloaded stills or generated dish photos. Keep all nine distinct sources, including the California bonus outside Florida maps.
- Retain the shared provider player and disclose provider-controlled playback. A native embed is not a guarantee of inline video.
- Replace the incorrect park-ID suppression test with stronger nine-source executed render coverage and no-substitution protection. New map test exercises actual controller code with a documented MapKit fixture, repeated clicks, source-coordinate associations, selection, focus, fit and cleanup. The fixture is not live Apple acceptance.

## Rights and remaining acceptance boundaries
Disney press terms exclude online travel guidebooks/apps; official food images are not treated as freely licensed publication assets: https://disneyexperiences.com/supplemental-terms-of-use/ . Native source embeds show the original food without copying/rehosting. Standalone licensed food photography remains a separate rights dependency.

The geographic map has a forest/cream visual treatment and numbered pins. It is NOT a newly illustrated Pinto’s Farm-style basemap. No completion claim may erase that distinction.

Local phone QA achieved 390 px with no document overflow, working stop links and California source rendering. The local test-placeholder build cannot establish real MapKit rendering. Final release acceptance must check live pins, all five tabs, repeated navigation, Back/Forward, mobile layout and provider media on the actual preview/production revision. Never report build/iframe success as those checks.

## Custom geographic atlas increment
The MapKit-only interim design above is superseded by ten custom SVG views: a useful food-area crop and wider overview for each of five parks. Geometry comes from OSM, not generated park drawings or traced proprietary maps. Real paths, water, building footprints and source-derived landmark labels share the same EPSG:3857 transform as the seven food markers. Colors use cream, sage, teal and warm footprints. `MapCategoryPin` preserves the shared sitewide food symbol. Native 48×58 px buttons activate the existing scroll/focus callbacks; core/whole toggle and 1–3× zoom preserve geographic alignment.

Source data, ODbL attribution, acquisition manifest, SHA-256 output hashes, complete relation assembly, exclusions and renderer are published under `/guides/disney-food-2026/maps/`. Six malformed source relations were omitted rather than invented: three pedestrian surface areas (Liberty Bell Courtyard; EPCOT south World Showcase promenade and WC SSE West), three green areas. No water/building relation was omitted. This is an independent reference map, not complete routing or accessibility/closure advice. Current source audit and exact exclusions are downloadable with the data.

### Executed local browser acceptance
- Actual measured widths 390, 768 and 1280; no document horizontal overflow. Browser window resizing alone initially clamped to500, so actual390 was established with the supported tab device-metrics override and measured again. Overrides cleared after QA.
- All seven map buttons across all five tabs opened and focused the correct food section. Repeated Terra Treats activation worked. Core/whole and zoom changed the correct SVG and canvas without overflow. All five source maps loaded.
- Native Gingerbread Cheesecake Pop carousel displayed the actual food. Its Play button produced `paused=false`, `readyState=4`, and advancing `currentTime=10.111`: one concrete in-page playback pass, not a claim for all posts.
- California `DfdaTVttmvV` food preview visibly rendered and remained outside Florida park maps. Other Instagram Reels offered provider-controlled outbound playback; no universal inline-play guarantee.
- Seven renderer tests passed on Mac. The actual React map test verifies five rendered tabs, seven anchors against independent bbox/Mercator math, ten SVGs, published source hashes, ODbL links, repeated clicks and view/zoom changes. Disabling the callback made this test fail; restored code passed.
- Initial full suite correctly rejected undeclared raw guide images. Fixed implementation uses the existing declared map-canvas contract with width/height/alt and shared `MapCategoryPin`, without weakening that guard.

Final full-suite/build/bundle and exact deployed revision still need recording below. Local browser acceptance is not production acceptance.

Final local checks: production build, JSX and bundle gate passed (485.4 KB total gzip, 566.6 KB first load; largest function40.6 MiB). Published renderer regenerated all ten SVGs byte-for-byte from the shipped source data. The complete local prebuild was attempted repeatedly while integrating; declared-map, artwork registry and movie-function tracing guards caught real integration omissions and were honored. The last full run progressed through its parallel phase and serial browser checks without a reported assertion failure, but the execution session ended with signal143 before the runner's final success line. Therefore local full-suite completion is NOT claimed. Exact-head CI's four disjoint shards plus aggregate coverage gate must pass before merge.

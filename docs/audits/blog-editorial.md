# Wayfind blog editorial census

Audited 2026-09-09 from the five guide data modules and route code. This is a code/content inventory, not fresh venue research. All 41 guide URLs were HTTP 200 with one H1 in the supplied production baseline; factual rechecks remain unchecked.

## Priority findings

- **high — hero-copy-template.** All 41 guide pages pass PremiumIntentHero the same title-derived description template; metadata descriptions vary, but visible hero copy is generic and does not answer guide intent. Action: Use guide-specific opening copy derived from g.intro/decision, capped to a concise above-fold answer.
- **high — hero-resolver-reuse.** Only 3 guides have slug-owned hero art. The remaining 38 reuse broad category or neutral images; one route is misrouted by substring matching date inside dated. Action: Resolve art by slug/brief, record rights and depicted subject, and replace generic or mismatched imagery.
- **high — hub-coverage.** The /guides hub groups all records but renders only four hard-coded regions, so 16 of 41 guides are omitted from crawlable hub links. Action: Use data-driven region ordering and render every guide once.
- **high — authorship.** Every guide visibly says Written by the Wayfind team, led by Gabriel Pereira and emits Gabriel Pereira as Article author JSON-LD. The repository does not establish a per-guide visit record or expanded biography. Action: Use truthful author/methodology copy and date labels; treat visit and credential claims as unchecked.
- **medium — sources.** Only the Halloween food and Fall Events data modules carry an explicit sources array. Other guides have no in-data source register, so claims need factual recheck before premium publication. Action: Add source/evidence records or mark each recommendation pending verification.
- **medium — inline-visuals.** Only Orlando Halloween Food has pick-level inline visuals (23 editorial visualizations); the other 40 guides have no inline image evidence. Action: Add relevant licensed/original inline art selectively, with alt text, credits, and disclosure where illustrative.
- **blocker — seasonal-summer.** Ten summer-2026 guide modules carry an explicit 2026-08-30 sunset, already past audit date 2026-09-09. Action: Remove, redirect, or refresh all ten before treating portfolio as publish-ready.
- **low — count-integrity.** All 19 title-count guides have matching pick counts; title years, acreage, and distance are excluded from count checks. Action: Retain as a guard while changing titles or pick lists.
- **low — local-refs.** All resolver and inline image paths referenced by the 41 guide records resolve under public/. Action: Keep asset existence check in release QA; rights and visual relevance remain separate checks.

## Route boundaries

| Route | Type | Coverage | Audit note |
|---|---|---:|---|
| /guides | collection | 41 | The regions object receives all omitted regions, but JSX maps only the four-item order array. |
| /guides/[slug] | detail | 41 | all 41 URLs HTTP 200; all have one H1 |
| /culture/[metro] | city-editorial-collection | 7 | Distinct city culture pages, not entries in GUIDES; 3 have named heroes and 4 use neutral hero fallback. Article author is Organization Wayfind. |
| /florida-events | curated-event-collection | dynamic | Dynamic collection; individual Event schema belongs on detail pages. |
| /florida-events/[slug] | curated-event-detail | dynamic | Distinct from guide roundups; hero ladder is consented event photography, row hero_image, then monogram. |
| /florida/[town] | destination-editorial-collection | 10 | Distinct destination profiles with live ranked listings; not part of 41 guide records. |

The current /guides display order links **25 of 41** records. The omitted 16 are: swim-with-manatees-crystal-river, bioluminescence-kayak-tour-space-coast, florida-scalloping-crystal-river-homosassa, weeki-wachee-kayak-mermaids-guide, birthday-freebies-bradenton-sarasota, anna-maria-island-day-trip, de-soto-national-memorial-bradenton, robinson-preserve-bradenton, things-to-do-miami-summer-2026, things-to-do-fort-lauderdale-summer-2026, things-to-do-key-west-summer-2026, things-to-do-st-augustine-summer-2026, things-to-do-daytona-beach-summer-2026, things-to-do-panama-city-beach-summer-2026, things-to-do-naples-summer-2026, things-to-do-in-parrish-florida.

## Full guide coverage

| Slug | Region | Updated | Hero resolver / reuse | Picks / title count | Inline art | Hub | Key flags |
|---|---|---|---|---:|---:|---|---|
| swim-with-manatees-crystal-river | Crystal River | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 7/— | 0 | NO | Global neutral fallback; no topic-specific subject.; terms recheck |
| bioluminescence-kayak-tour-space-coast | Cocoa Beach | 2026-08-07 | /brand/orlando-paddleboard-portrait.jpg (4x; keyword:water) | 5/— | 0 | NO | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| florida-scalloping-crystal-river-homosassa | Crystal River | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 5/— | 0 | NO | Global neutral fallback; no topic-specific subject.; terms recheck |
| weeki-wachee-kayak-mermaids-guide | Weeki Wachee | 2026-08-07 | /brand/orlando-paddleboard-portrait.jpg (4x; keyword:water) | 5/— | 0 | NO | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| winter-park-scenic-boat-tour | Orlando | 2026-07-07 | /brand/orlando-paddleboard-portrait.jpg (4x; keyword:water) | 3/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| siesta-key-drum-circle | Sarasota | 2026-07-07 | /cards/beach-adobestock-216195684.jpeg (6x; keyword:beach) | 3/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| pinecraft-sarasota-amish-village | Sarasota | 2026-07-07 | /cards/date-night-dining-hero.jpg (7x; keyword:dining) | 4/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| siesta-key-vs-lido-key | Sarasota | 2026-07-07 | /cards/beach-adobestock-216195684.jpeg (6x; keyword:beach) | 3/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| things-to-do-sarasota | Sarasota | 2026-07-07 | /cards/beach-adobestock-216195684.jpeg (6x; keyword:beach) | 10/10 | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; direct overlap; terms recheck |
| best-cuban-sandwich-tampa | Tampa | 2026-07-07 | /cards/date-night-dining-hero.jpg (7x; keyword:dining) | 4/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| st-armands-circle-restaurants | Sarasota | 2026-07-07 | /cards/date-night-dining-hero.jpg (7x; keyword:dining) | 6/6 | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| best-restaurants-disney-springs | Orlando | 2026-07-07 | /cards/date-night-dining-hero.jpg (7x; keyword:dining) | 7/7 | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| best-hotels-near-magic-kingdom | Orlando | 2026-07-07 | /brand/orlando-night-wheel-portrait.jpg (5x; region:orlando-fallback) | 6/— | 0 | yes | Orlando night wheel is not a hotel or Magic Kingdom image.; terms recheck |
| gatorland-vs-wild-florida | Orlando | 2026-07-07 | /brand/orlando-night-wheel-portrait.jpg (5x; region:orlando-fallback) | 3/— | 0 | yes | Orlando night wheel does not depict either gator park.; terms recheck |
| things-to-do-orlando-not-theme-parks | Orlando | 2026-07-07 | /brand/orlando-night-wheel-portrait.jpg (5x; region:orlando-fallback) | 12/12 | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; seasonal-overlap; terms recheck |
| sarasota-half-price-dining | Sarasota | 2026-07-31 | /cards/date-night-dining-hero.jpg (7x; keyword:dining) | 4/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| orlando-in-the-rain | Orlando | 2026-07-31 | /brand/orlando-night-wheel-portrait.jpg (5x; region:orlando-fallback) | 9/9 | 0 | yes | Orlando night wheel does not convey indoor/rain intent.; terms recheck |
| birthday-freebies-bradenton-sarasota | Bradenton | 2026-09-01 | /brand/opt/hero-1600.webp (16x; global-neutral) | 26/26 | 0 | NO | Global neutral fallback; no topic-specific subject.; terms recheck |
| anna-maria-island-day-trip | Bradenton | 2026-07-10 | /cards/beach-adobestock-216195684.jpeg (6x; keyword:beach) | 3/— | 0 | NO | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| myakka-river-state-park-guide | Sarasota | 2026-07-10 | /brand/opt/hero-1600.webp (16x; global-neutral) | 3/— | 0 | yes | Global neutral fallback; no topic-specific subject.; terms recheck |
| ybor-city-tampa-guide | Tampa | 2026-07-10 | /brand/opt/hero-1600.webp (16x; global-neutral) | 3/— | 0 | yes | Global neutral fallback; no topic-specific subject.; terms recheck |
| tampa-riverwalk-guide | Tampa | 2026-07-10 | /brand/opt/hero-1600.webp (16x; global-neutral) | 3/— | 0 | yes | Global neutral fallback; no topic-specific subject.; terms recheck |
| de-soto-national-memorial-bradenton | Bradenton | 2026-07-10 | /brand/opt/hero-1600.webp (16x; global-neutral) | 3/— | 0 | NO | Global neutral fallback; no topic-specific subject.; terms recheck |
| robinson-preserve-bradenton | Bradenton | 2026-07-10 | /brand/orlando-paddleboard-portrait.jpg (4x; keyword:water) | 3/— | 0 | NO | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; terms recheck |
| magical-dining-orlando-2026 | Orlando | 2026-08-19 | /cards/date-night-dining-hero.jpg (7x; keyword:dining) | 10/— | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; subset-overlap; terms recheck |
| things-to-do-orlando-summer-2026 | Orlando | 2026-08-07 | /brand/orlando-night-wheel-portrait.jpg (5x; region:orlando-fallback) | 10/10 | 0 | yes | Keyword/category fallback; confirm the photograph depicts this guide rather than only its broad category.; summer sunset passed; seasonal-overlap; terms recheck |
| things-to-do-miami-summer-2026 | Miami | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | NO | Global neutral fallback; no topic-specific subject.; summer sunset passed; terms recheck |
| things-to-do-tampa-summer-2026 | Tampa | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | yes | Global neutral fallback; no topic-specific subject.; summer sunset passed; seasonal-overlap; terms recheck |
| things-to-do-fort-lauderdale-summer-2026 | Fort Lauderdale | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | NO | Global neutral fallback; no topic-specific subject.; summer sunset passed; terms recheck |
| things-to-do-key-west-summer-2026 | Key West | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | NO | Global neutral fallback; no topic-specific subject.; summer sunset passed; terms recheck |
| things-to-do-st-augustine-summer-2026 | St. Augustine | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | NO | Global neutral fallback; no topic-specific subject.; summer sunset passed; terms recheck |
| things-to-do-daytona-beach-summer-2026 | Daytona Beach | 2026-08-07 | /cards/beach-adobestock-216195684.jpeg (6x; keyword:beach) | 10/10 | 0 | NO | Reuses the same generic beach image as other cities; it is not Daytona-specific.; summer sunset passed; terms recheck |
| things-to-do-panama-city-beach-summer-2026 | Panama City Beach | 2026-08-07 | /cards/beach-adobestock-216195684.jpeg (6x; keyword:beach) | 10/10 | 0 | NO | Reuses the same generic beach image as other cities; it is not Panama City Beach-specific.; summer sunset passed; terms recheck |
| things-to-do-st-petersburg-clearwater-summer-2026 | St. Petersburg | 2026-08-26 | /brand/opt/hero-1600.webp (16x; global-neutral) | 11/11 | 0 | yes | Global neutral fallback; no topic-specific subject.; summer sunset passed; terms recheck |
| things-to-do-naples-summer-2026 | Naples | 2026-08-07 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | NO | Global neutral fallback; no topic-specific subject.; summer sunset passed; terms recheck |
| things-to-do-in-parrish-florida | Parrish | 2026-08-13 | /brand/opt/hero-1600.webp (16x; global-neutral) | 10/10 | 0 | NO | Global neutral fallback; no topic-specific subject.; terms recheck |
| things-to-do-in-sarasota-florida | Sarasota | 2026-08-13 | /guides/things-to-do-in-sarasota-florida.jpg (1x; slug-owned) | 17/17 | 0 | yes | direct overlap; terms recheck |
| things-to-do-in-tampa-florida | Tampa | 2026-08-26 | /brand/opt/hero-1600.webp (16x; global-neutral) | 22/22 | 0 | yes | Global neutral fallback; no topic-specific subject.; seasonal-overlap; terms recheck |
| gulf-coast-brunch-and-date-night | Sarasota | 2026-08-19 | /guides/gulf-coast-brunch-and-date-night.jpg (1x; slug-owned) | 6/— | 0 | yes | terms recheck |
| orlando-halloween-food-2026 | Orlando | 2026-09-02 | /guides/orlando-halloween-food-2026/hero.webp (1x; slug-owned) | 23/— | 23 | yes | subset-overlap; terms recheck; sources field |
| fall-events-orlando-2026 | Orlando | 2026-09-07 | /cards/date-night-dining-hero.jpg (7x; keyword:dining (false-positive date-to-dated)) | 18/— | 0 | yes | The date keyword branch matches "dated" and sends this event guide to dining art.; subset-overlap; terms recheck; sources field |

Title counts use only list-count patterns such as 10 Best or 12 Things; years, acreage, and distance do not count. All 19 detected list counts match their pick arrays. Exact metadata descriptions are unique, but every guide uses the same visible hero description template, recorded in JSON as repeatedHeroDescription: true.

## Duplicate and cannibalization decisions

- **swim-with-manatees-crystal-river** — adjacent with florida-scalloping-crystal-river-homosassa. Keep separate by winter manatee versus summer scallop intent; cross-link with season labels.
- **florida-scalloping-crystal-river-homosassa** — adjacent with swim-with-manatees-crystal-river. Keep separate by summer scallop versus winter manatee intent; recheck annual FWC dates.
- **things-to-do-sarasota** — direct-overlap with things-to-do-in-sarasota-florida. Choose one canonical broad Sarasota guide; redirect, consolidate, or make one explicitly beyond-the-basics.
- **things-to-do-in-sarasota-florida** — direct-overlap with things-to-do-sarasota. Choose one canonical broad Sarasota guide; redirect, consolidate, or make one explicitly beyond-the-basics.
- **things-to-do-orlando-not-theme-parks** — seasonal-overlap with things-to-do-orlando-summer-2026. Keep evergreen non-theme-park intent canonical; move seasonal openings into dated update sections.
- **things-to-do-orlando-summer-2026** — seasonal-overlap with things-to-do-orlando-not-theme-parks. Sunset/remove dated page after its window or clearly narrow the title and canonical.
- **things-to-do-in-tampa-florida** — seasonal-overlap with things-to-do-tampa-summer-2026. Keep evergreen Tampa guide canonical; move seasonal picks into a dated section or separate clearly seasonal intent.
- **things-to-do-tampa-summer-2026** — seasonal-overlap with things-to-do-in-tampa-florida. Sunset/remove dated page after its window or narrow its intent.
- **fall-events-orlando-2026** — subset-overlap with orlando-halloween-food-2026, magical-dining-orlando-2026. Keep roundup as hub and link food/event subguides with distinct anchors; avoid repeating full lists.
- **orlando-halloween-food-2026** — subset-overlap with fall-events-orlando-2026. Keep food-specific intent; link to roundup and do not duplicate event date prose.
- **magical-dining-orlando-2026** — subset-overlap with fall-events-orlando-2026. Keep restaurant-program intent; link to roundup and maintain one source of program dates.
- **gulf-coast-brunch-and-date-night** — adjacent with st-armands-circle-restaurants, sarasota-half-price-dining. Differentiate by occasion and geography in titles, intros, and internal links.
- **st-armands-circle-restaurants** — adjacent with gulf-coast-brunch-and-date-night, sarasota-half-price-dining. Differentiate by St. Armands geography and restaurant selection.
- **sarasota-half-price-dining** — adjacent with gulf-coast-brunch-and-date-night, st-armands-circle-restaurants. Differentiate by certificate/deal intent and date validity.

## Visual and trust evidence

- Only three guide heroes are slug-owned: Sarasota city, Gulf Coast brunch/date night, and Orlando Halloween food. Halloween food has 23 pick-level editorial visualizations, each labeled as illustrative; the other 40 guides have no inline image evidence in data.
- public/guides/CREDITS.md records rights for the two Unsplash heroes and the Halloween visualizations. Other fallback assets have no per-guide subject/rights record in the guide data.
- All 41 local hero/inline paths resolve under public/; this does not prove image relevance, rights, or factual claims.
- Guide detail markup hard-codes Gabriel Pereira as Article author and visible team-led byline. Confirm the actual author/methodology and date labels before publication.
- PR1201 covers six body-layout/exact-place-resolution fixes. This census deliberately records portfolio/editorial findings and does not alter those body fixes.

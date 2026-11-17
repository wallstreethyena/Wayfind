# Disney holiday food guide: editorial and release record

Owner clarification, November 17, 2026: this is a full GoWayfind guide with a map like Pinto’s Farm, rather than a place-card-only intake. The dedicated route has no database or map-provider dependency. The earlier four-venue insert migration is not a prerequisite and is not applied by this work.

## Intent and contribution

- Primary query: Disney World holiday food guide 2026.
- Related intent: Christmas snacks, Animal Kingdom holiday food, Jollywood beignets and the Cookie Bar sundae.
- Geography: Walt Disney World, Orlando; four separate parks plus Disney Springs.
- Audience: families, couples and visitors choosing food around admission they already hold.
- Decision: which supplied treat belongs in which park day, where to find it, which ticket is needed, and which original post to inspect.
- Proposed canonical: `https://www.gowayfind.com/guides/disney-world-holiday-food-guide-2026`.
- Distinct contribution: one Pinto-style interactive orientation diagram, six coordinated venue sections, seven native creator posts, an admission/price comparison and three practical outing ideas. No walking paths or measured travel times are invented.
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

Only Disney Parks Blog was requested for Disney menu research. No automated request was made to the Disney World website, My Disney Experience or reservation endpoints. No Google API calls, new paid APIs or database writes were needed. Price amounts are attributed to the supplied screenshots and remain explicitly unverified as current prices. Daily hours, waits, accessibility facilities and parking prices are not invented. Outing plans are editorial suggestions, not timed or optimized routes. All seven canonical source URLs and creator handles live with their stop records in `lib/guidesDisneyHolidayFood2026.js`.

## Image and media record

The explicit hero and guide-index record reuses `/guides/context/magic-kingdom-christmas.webp`, 1280×853, 132,964 bytes. Actual subject: Main Street’s Christmas tree and buildings at Magic Kingdom. Nearby copy identifies a past setting photograph, not the current food. Source: https://commons.wikimedia.org/wiki/File:Christmas_at_Magic_Kingdom_-_panoramio.jpg . Photographer Ivan Curra, CC BY-SA 3.0, source dimensions 4608×3456; existing resize/crop/WebP adaptation retains the license and visible credit. Asset pixels and live source/license were inspected. Desktop, phone, index and social crops are not claimed visually passed without a rendered browser observation.

Unsplash alternatives were sought, including `WTDKnUfhynE` and `RZNe_QZRi04`; the existing verified holiday setting image was retained to avoid a new download. The seven creator posts are native embeds opened on demand with direct source links. They are not downloaded, rehosted or represented as licensed still photography. Six photo-gap records state this actual limit and name the relevant creator leads without claiming an exhaustive photo search.

## Verification status

| Criterion | Status | Evidence or limit |
| --- | --- | --- |
| Scope, map and post identity | Pass | Shared stop data; five destination groups, six distinct section/pin IDs, seven exact Instagram URLs, one `/p/` carousel. Independent Astra source review and executed resolver checks. |
| Menu facts and admission | Pass within stated scope | Four official menu stops; two creator finds clearly separated. Source dates and limitations visible in article. |
| Guide discovery and route ownership | Pass, source | Registry plus dedicated-route exclusion protects the custom page; shared guide index and sitemap discover it through the registry. Production HTTP remains unverified. |
| Hero rights and identity | Pass | Existing exact-setting pixels inspected; source, photographer and CC BY-SA license rechecked. |
| Page HTML and anchors | Pass, SSR | Real page/component server render: one descriptive H1, six stop sections, seven original links/actions, twenty local anchors resolving to real IDs, zero initial provider iframes, Article and BreadcrumbList parsed. This is not a production browser test. |
| Metadata and lifecycle | Pass, source | Self-canonical; absolute production OG image; Article/Breadcrumb wiring; visible byline and research date. `isGuidePast` governs noindex after Jan 5 and the archive notice; 900-second revalidation. |
| Existing guide checks | Pass | Guide/editorial/image/dedicated-route/teaser/published/source-audit checks executed. Hardcoded registry counts advance from 85 to 86 with the new reviewed guide. No guard removed or skipped. |
| Generic source audit | Honest unknown for dedicated routes | The generic template cannot prove a bespoke page. Dedicated route-only checks now remain unknown there, while shared sitemap and actual asset inventory remain meaningful. Historical report filename retained as rolling snapshot. |
| Map controls | Pass in component harness | SSR and jsdom exercise initial six pins, Animal Kingdom filter to two stops, synchronized list/pin/panel, all reset and local reduced-motion centering. |
| Phone/desktop browser rendering | Unknown | Cloud browser could not reach the local development server; it also rejects local-file URLs. No protocol or security workaround attempted. Hosted preview needed for actual rendered/crop/viewport checks. |
| Full suite and production build | Pending final result | Record final command outcomes in the PR before delivery. Focused passes do not certify these gates. |
| Security audit | Blocked | `npm audit --audit-level=moderate` reproduced GHSA-fc5q-39xc-vjpf in unchanged picomatch/Rollup/Sentry dependencies. No audit suppression, dependency downgrade or security-gate change. |
| Published / verified live / Google indexing | Unknown, not claimed | New URL is not yet deployed. Sitemap source membership does not establish crawlability or indexing. |

A standalone review copy is generated from actual page SSR and scoped CSS. It uses a small DOM adapter for map state and native post dialogs, so it is a review artifact, not evidence that the React production bundle or hosted page was exercised. Proposed measurement after publication: compare relevant Search Console queries and organic visits plus actual instrumented guide shares/place-card actions after 4–8 weeks, adjusted for seasonality. No recurring task is created.

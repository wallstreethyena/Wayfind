# Northeast holiday coverage and SEO brief

Checked November 17, 2026. This lane owns two new guides in `lib/guidesSocialNortheast2026.js`, exported as `SOCIAL_NORTHEAST_2026_GUIDES`. No database, registry, image manifest, template or deployment changes are included here.

## 1. Jacksonville Christmas by area and budget

- Proposed canonical: `https://www.gowayfind.com/guides/jacksonville-christmas-by-area-budget-2026`.
- Primary intent: choose a Jacksonville-area Christmas outing by geography, admission basis and operating date.
- Query: `jacksonville christmas events 2026`. Natural variants: Christmas lights, free events, markets and ice skating in Jacksonville; Clay County holiday events.
- Audience: families, couples and local groups planning an afternoon or evening.
- Constraints: select dates; separate areas that cannot form one walking itinerary; base admission versus all-in spend; outdoor weather; uncertain social leads.
- Contribution: reconciles all 17 screenshot-carousel leads, corrects budget and venue confusion, and groups decisions by actual area. It does not claim 17 fully verified current events.
- Title/H1: Jacksonville Christmas 2026: Lights, Markets and Skating by Area and Budget.
- Meta description: Plan Jacksonville Christmas outings by area and budget, from Deck the Chairs and the boat parade to skating and markets, with 2026 dates and booking caveats.
- Publication and material update date: November 17, 2026. Seasonal promotion ends January 18, 2027.
- Existing overlap: statewide `free-christmas-lights-florida-2026`, `florida-christmas-markets-and-towns-2026`, `florida-snow-and-ice-2026`; existing individual event URLs. Keep these as different intents. Do not create additional synonyms for this local planning page.
- Search demand, volume and ranking: unknown in this lane. No metrics invented.

### Coverage reconciliation

| Screenshot lead | Guide treatment | Publication limit |
| --- | --- | --- |
| Deck the Chairs | Current organizer dates, free admission; existing event link | Program dates distinct from daily lights |
| Jacksonville Light Boat Parade | City-confirmed single evening; existing event link | No assumed all-season parade |
| Artist Walk on Ice | Operator entrance, session length, base price, reservation rules | Price excludes taxes and fees |
| Riverside Avondale Luminaria | Organizer-confirmed one-night neighborhood event | Kit pickup is not a universal event entrance |
| ZOOLights | Operator-confirmed ticketed event | Regular nonmember admission is not under $30 |
| Glowing Gardens | Destination-organization season; detailed operator schedule unknown | No nightly, hours or price claim |
| Blackhawk Bluff | Current official destination listing; operator blocked | No confirmed end date or recycled traffic plan |
| Hometown Holiday | Exact current town event page | Stale town location-calendar schedule rejected |
| Christmas on Walnut Street | Current city program | Shopping purchases not called free |
| Parade of Trees | Current city nightly December dates | Sponsorship fee is not visitor admission |
| Vintage Market Days | Clay County Fairgrounds edition | Distinct from Diamond D Ranch |
| Diamonds in the Rust | Current Diamond D Ranch edition | Parking and children's activities separated |
| Nights of Lights | County-confirmed citywide public lights | Separate St. Augustine outing |
| Grey Matter Elf | Venue and annual holiday concept only | 2026 film theme and precise dates unconfirmed |
| Beauclerc Road | Clearly marked residential lead | No unverified home address or active schedule |
| Christmas at Sykes | Venue only, current page still fall maze | No invented Christmas edition |
| Forgotten Tonic Miracle | Venue only, current site still Halloween | No recycled 2024 menu or unconfirmed 2026 dates |

## 2. St. Augustine Christmas coffee and snow walk

- Proposed canonical: `https://www.gowayfind.com/guides/st-augustine-christmas-coffee-snow-walk-2026`.
- Primary intent: plan a compact St. George Street Christmas outing with coffee and lights while checking the advertised snowfall.
- Query: `st augustine christmas coffee snow walk`. Natural variants: St. George Street Christmas snow, St. Augustine Christmas coffee shop, Santa's Toy Shop coffee, Nights of Lights walking itinerary.
- Audience: families and couples who want a manageable walking area rather than a regional attraction circuit.
- Constraints: museum closing time, regular cafe hours, snowfall uncertainty, restaurant closures, outdoor weather and select shuttle dates.
- Contribution: a close-address cluster, sensible stop ordering, explicit cost separation, and a distinction between the city lights run and individual pop-up schedules.
- Title/H1: St. Augustine Christmas Walk 2026: Coffee, Lights and the Snowfall Stop.
- Meta description: Plan a St. Augustine Christmas walk around St. George Street coffee, the Oldest Wooden School House and Nights of Lights, with snow and pop-up details to confirm.
- Publication and material update date: November 17, 2026. Seasonal promotion ends January 18, 2027.
- Overlap: the existing Nights of Lights event page owns season dates and event logistics. This guide owns a coffee/museum walking-area decision. The Jacksonville roundup mentions St. Augustine only as a separate outing.
- Search demand and baseline: unknown in this lane. No firsthand visit, measured walking time or accessible route is claimed.

### Evidence limits retained in public copy

- Schoolhouse holiday screenshot hours differ from standard website hours. Readers are told to confirm.
- The supplied official schoolhouse post advertises Auggie's snow start. It does not establish repeated nightly sessions.
- The supplied coffee house organizer post supports Santa's Toy Shop. The city lights run does not establish identical popup dates.
- Forgotten Tonic's current site did not confirm the 2026 Miracle edition.
- Current city shuttle news was used; the general city shuttle page still displayed the prior season and was rejected.

## Internal link implementation map

The template does not consume a per-guide related-links field. Root should add reciprocal entries in `lib/guideSeo.js` `GUIDE_CONTEXT_LINKS` before release.

| Source | Destination | Reader purpose |
| --- | --- | --- |
| Jacksonville local guide | St. Augustine coffee/snow guide | Plan a separate St. Augustine outing |
| St. Augustine coffee/snow guide | Jacksonville local guide | Compare another Northeast Florida day |
| Jacksonville local guide | Free Christmas lights statewide guide | Compare free light displays elsewhere |
| Jacksonville local guide | Christmas markets and towns statewide guide | Compare destination markets |
| St. Augustine coffee/snow guide | Free Christmas lights statewide guide | Compare a public lights outing elsewhere |
| Statewide guides where context fits | These local guides | Go deeper on local logistics |

Per-pick event links are included for the root's confirmed current or newly prepared event slugs: Deck the Chairs, boat parade, Luminaria, ZOOLights, Glowing Gardens, Blackhawk Bluff, Hometown Holiday, Christmas on Walnut Street, Parade of Trees, Vintage Market Days, Diamonds in the Rust, Artist Walk on Ice and Nights of Lights. Root must verify every new event URL after applying its reviewed inventory change.

Explicit existing inventory IDs supplied by root are used only for known venues. Grey Matter's needs-review record is not used as an approved card. Unknown seasonal leads do not get seasonal booking CTAs. The renderer's existing official-ticket host allowlist was not widened.

## Technical and editorial gate

| Item | Status | Evidence or required completion |
| --- | --- | --- |
| Distinct local decision and direct opening | Pass | Visible in each data record |
| Supported title, H1 input, description, dates | Pass | Existing guide schema fields |
| Honest authorship and methodology | Pass | Gabriel bio; research/screenshot limits stated |
| All 17 carousel leads reconciled | Pass | 17 Jacksonville picks, uncertainty retained |
| Venue identity and sources | Pass with stated limits | Existing IDs supplied by root; no invented ID |
| Date, price and theme uncertainty | Pass | Unknown leads explicitly labeled |
| Published URL collision check | Unknown | Root registry audit required |
| Contextual crosslinks | Pending | Root `GUIDE_CONTEXT_LINKS` wiring |
| New event link availability | Pending | Root event migration and live verification |
| Guide hero and index assignment | Blocked in this lane | Root owns explicit per-slug imagery |
| Exact event photos | Unknown | `neutralPickFallback: true` prevents unrelated last-rung stock |
| Crawlable HTML, HTTP200, robots, canonical | Unknown | Requires implemented production URLs |
| Sitemap inclusion | Unknown | Verify after central registry integration |
| Social metadata | Unknown | Inherits template; verify final URLs and legitimate image |
| Article/Breadcrumb/FAQ schema | Unknown | Existing template emits these; root must validate rendered content and current eligibility |
| Mobile/desktop render, buttons, crop checks | Unknown | Root verification after integration |
| Google indexing | Unknown | Crawlability is not indexing |
| Organic effect | Unknown | No post-change measurement yet |

`editorialMode: true` is the supported template flag for these dated guides, keeping unrelated live commerce and weather rails out of the article. `eventGuide` is not a supported field in the inspected implementation.

## Image assignment record

No new imagery was downloaded, generated or licensed by this lane. User-supplied social screenshots were used as research evidence, not permission to reproduce their photos.

For each of the two slugs, root must record the exact hero/index URL, actual subject, caption and natural alt text, source URL, photographer, rights basis, source and delivered dimensions, bytes and desktop/mobile/share crops. Seek a suitable free-to-use Unsplash image first; if no exact venue photograph is available, an honestly labeled contextual photograph may serve only appropriate context. Named recommendation photos must depict that exact venue or event, otherwise retain the neutral fallback.

## Measurement package

Hypothesis: a useful local area/budget page and a distinct St. George Street planning page may improve relevant organic discovery and onward place/event visits. This is an unvalidated hypothesis.

Preserve a pre-change GSC baseline where available: query and page clicks, impressions, CTR and average position, with device/country and dates. Record relevant instrumented Wayfind event/place actions if available; no event name was invented here. Compare after roughly 4 to 8 weeks, accounting for seasonality, low volume and concurrent work. This task does not create a recurring job.

## Validation owned by this lane

The data module is syntax/import checked and the exported guide/pick counts are asserted after writing. Root owns registry integration, full repository guard/build execution, production publication and live rendering checks. Never treat this document as evidence of deployment.

# Central Florida social discovery coverage, 17 November 2026

## Owned output

`lib/guidesSocialCentral2026.js` exports `SOCIAL_CENTRAL_2026_GUIDES`, three distinct editorial guides and 11 sections. They use the existing guide data model. No renderer, ranking, refresh, map, booking resolver or image cache behavior changes are included. `editorialMode: true` and `neutralPickFallback: true` apply to each guide. There is no supported `eventGuide` property in the current renderer, so none was introduced.

Research evidence: `/workspace/scratch/b868f070c8bc/central-research.json`. Exact external URLs are in the guide data; supplied screenshots supply only explicitly attributed observations. These are research-based guides, not claimed firsthand visits.

## Intent and URL briefs

| Proposed canonical URL | Primary intent and reader decision | Audience, geography and constraints | Existing coverage and distinct contribution |
| --- | --- | --- | --- |
| `https://www.gowayfind.com/guides/snowcat-ridge-vs-wunder-glow-2026` | `snowcat ridge vs wunder glow`; choose the right Dade City attraction and budget for separate admission | Families and couples; Dade City; selected dates, outdoor setting, entry times and parking costs | Expands the existing Snowcat event detail and statewide snow/ice guide. A comparative decision page, not a second Snowcat general guide. Explicit shared-address/separate-ticket distinction. |
| `https://www.gowayfind.com/guides/tampa-christmas-coffee-and-farm-outings-2026` | `tampa christmas outings 2026`; choose a manageable small outing and distinguish confirmed dates from seasonal leads | Tampa residents/visitors; Tampa, Plant City and a separately planned Oxford trip; short outing, limited promotions and uncertain farm/menu details | Existing Tampa holiday-events blog is a broad calendar. This page focuses on coffee/celebration/farm outing choices and geography. It must link the existing broad calendar rather than compete as another list of all Tampa events. |
| `https://www.gowayfind.com/guides/orlando-christmas-concerts-and-santa-2026` | `orlando christmas concerts and santa 2026`; choose downtown concerts or an I-Drive Santa outing | Families and couples; separate downtown and International Drive districts; concert schedule, Santa booking and attraction extras | Existing Orlando holiday-events blog covers the Dec4 Lake Eola tree lighting. This page addresses selected Dec5–20 concerts and the Santa-photo/carousel condition. Do not change Dec4 tree-lighting dates to concert dates. |

Topic demand is **unvalidated** in this lane. No search-volume, keyword-difficulty, ranking, CTR or traffic forecast is invented. Root integration may attach independently retrieved Search Console evidence.

Each data object contains its descriptive title tag/H1 text, accurate description, teaser, primary keyword, natural query variants, direct opening answer, visible section hierarchy, FAQ, source list, byline bio and methodology. Published/updated are both the actual creation date, `2026-11-17`. End dates archive the seasonal promotion without deleting URLs.

## Identity and internal-link map

The root coordinator supplied the following IDs from a production inventory read; this lane did not invent or fetch new Google IDs.

| Guide section | Link identity | Status before root integration |
| --- | --- | --- |
| Snowcat Ridge | `/florida-events/snowcat-ridge-alpine-snow-park-2026`; `/p/wfadd_snowcat_ridge_dade_city` | Existing event; root verifies place route |
| Wunder Glow | `/florida-events/wunder-glow-dade-city-2026` | Root creating and verifying event row |
| Centro Ybor | `/florida-events/centro-ybor-tree-lighting-2026` | Root creating and verifying event row |
| Blooming Floral Cafe | `/p/ChIJ9d2y1ivFwogRU2MFLQrwqsc` | Existing inventory identity; seasonal menu still unconfirmed |
| Brown's Oxford | `/p/ChIJWSFAm9XE54gRynJk-W1qRFA`; `/florida-events/browns-holiday-market-after-dark-2026` | Existing venue; root creating event row |
| Lake Eola concerts | `/p/ChIJu3hNU-N654gR0x0I9_3iNvc`; `/florida-events/dtolive-holidays-lake-eola-2026` | Existing park identity; root creating concert-series event |
| ICON Park Santa | `/p/ChIJw5jVAVN-54gRScNxiRF16j4`; `/florida-events/santa-workshop-icon-park-2026` | Existing complex; root creating event |
| SEA LIFE Orlando | `/p/ChIJmy7U4VJ-54gRi1LoS6wwFj0` | Existing identity; root verifies public route |
| Madame Tussauds Orlando | `/p/ChIJm-1TQ1N-54gRtKSCx6hQ8SU` | Existing identity; root verifies public route |
| Carousel on the Promenade | Exact-name app search scoped to Orlando | No separate place ID established by this lane |
| Lumley's Farm Christmas lead | None | No dead or guessed action; current Christmas address/schedule unresolved |

Related-guide contextual links to wire at root: existing statewide snow/ice guide; existing Tampa and Orlando Christmas-event blogs; the Christmas-in-Florida hub; the new regional guide siblings when verified. The rendered guide hides `sources` by established editorial policy, so confirmed event detail links are necessary for usable organizer/ticket handoff. Do not assume a `ticket` object with an unrecognized official hostname will render; `guidePickTicket` has a strict allowlist.

## Material evidence and editorial decisions

| Item | Checked evidence | Decision |
| --- | --- | --- |
| Brown's market start | Dedicated `holiday-market/` says4–9PM. Official `hours/` calendar says5–9PM. Supplied organizer screenshot also says5–9PM. All name Dec13,2026. | Preserve the date/end time and explain the unresolved start. Do not choose a precise start silently. Market entry/parking free; food, purchases and optional calf encounter extra. |
| Brown's activities | Dedicated event page says regular farm attractions do not operate during this market. | Distinguish a market outing from a normal attractions day. |
| ICON Park Santa schedule | Event season says Nov13–Dec24,2026; detailed hours explicitly headed2024; calendar entry12AM–11:59PM is all-day metadata. | Keep verified season; use current reservation calendar for daily visiting times. Do not publish old2024 hours or24-hour operation. |
| ICON Park complimentary carousel | Official Santa page specifies children under13 with a photo purchase. | Preserve both age and purchase condition. SEA LIFE/Madame Tussauds are discounted, not included, according to that page. |
| Wunder Glow prices | Official Nov21 page has entry-specific prices; late slots21.95 and early27.95 on the fetched page. Social18.95 does not establish every date/slot. | Quote date-specific amounts only with their date; guide uses variable-price explanation. Parking19 standard or24 preferred including tax from current official FAQ. |
| Snowcat calendar | Official hours spans selected dates Nov14,2026 to Feb28,2027; Nov20 3–11PM,Nov21 9AM–11PM,Nov22 9AM–10PM. | No every-day-open claim; no universal minimum admission price. |
| Lake Eola concerts | City series page and two individual performance pages opened. Dec5 Joe Fritz6–7:30PM; John Horton8–9:30PM. | Use official John spelling, selected nights and free concert admission. Do not imply free parking. |
| Centro Ybor | Chamber confirms Nov18,2026 6–9PM. Supplied venue post supplies7PM lighting and first350 attendees/$10 Centro Cash. | Attribute limited promotion to organizer post; no guarantee for all attendees. Distinguish event start from lighting. |
| Blooming | Exact venue inventory ID supplied by root. Website returned no readable body; menu PDF too large; seasonal drinks come from supplied creator post. | Clearly label seasonal menu/hours as unconfirmed. No claimed firsthand tasting or live availability. |
| Lumley's | Supplied creator shows decorated tractor in Plant City. Primary account fetch blocked; secondary fall listings cannot prove Christmas operation. | Retain as an explicitly unscheduled lead with no invented address, ID, price, date or booking action. |

## SEO, image and publication gate

| Check | Lane status | Evidence or remaining action |
| --- | --- | --- |
| Distinct useful intent/direct answer/heading hierarchy | Pass | Three decision-focused pages; no duplicate Snowcat general overview |
| Supported dates and prices | Pass with stated unresolved details | Seasonal leads and Brown start conflict are visible; no fabricated completion |
| Metadata, one H1 input, FAQ, author/date data | Pass in data | Runtime head/H1 verification remains root's responsibility |
| Contextual internal links | Needs work | IDs supplied; root must wire contextual links and prove destination content |
| Article and Breadcrumb schema | Unknown until integrated render | Existing guide scaffold supplies schema; root must inspect final HTML against current primary documentation |
| HTTP200, robots, canonical, sitemap and crawlable text | Unknown | This lane has not deployed the new slugs |
| Google indexing | Unknown | Do not claim indexing from a render or sitemap inclusion |
| Social metadata and legitimate hero/index images | Needs work | Root owns image assignments and final OG/Twitter verification |
| Per-slug image rights/crops/alt/dimensions/bytes | Blocked in this lane | No new imagery was selected or reused; neutral pick fallback prevents a false venue photograph. Root must record hero/index source, rights and crop checks. |
| Existing booking/affiliate behavior | Unchanged by this lane | No direct commerce link template, paid API call or ticket-host allowlist change |
| Mobile/desktop rendering, focus, control containment | Unknown | Root must inspect the final integrated page at achieved390px and desktop widths |

No source page or social screenshot grants permission to reuse its photographs. A neutral pick fallback does not establish that a separate hero photograph is licensed or representative. Explicitly label any licensed contextual hero so it is not presented as a venue photograph.

## Baseline and measurement handoff

Pre-change baseline for these new URLs: **not available** in this lane. Do not convert unavailable clicks, impressions, CTR, average position or engaged visits into zeros. Record the actual publication date after integration. Hypothesis: distinct local decisions, reliable geography and verified listing handoffs improve search usefulness and qualified place/event actions.

Review after roughly4–8 weeks when seasonal volume permits. Compare actual query/page impressions, clicks, CTR and average position with date, device, country and position context; check only genuinely instrumented guide-to-place, save and ticket actions. No monitoring automation or paid SEO tool is created by this work.

## Lane verification

- `node --check lib/guidesSocialCentral2026.js`: exit0 after creation and ID mapping.
- Direct module import/field verification: recorded in lane completion message.
- Full guards, JSX, build, registry/sitemap, preview and production checks are root integration work and are **not claimed passed here**.

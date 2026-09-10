# Poster intent audit, September 10, 2026

## Confirmed failure chain

The first production inspection matched GitHub main `1abf086c39501480403d36b34ab6f34d0a516a3e` to Vercel production deployment `dpl_G8x4jQnvYG5cyy2FEK3gyrZUufZb`.

The Sarasota Night Out API at `27.34,-82.54` returned two supermarkets under Night Tours: Publix at University Walk and Publix at Market Walk at North River Ranch. A later full-response sample contained 188 place entries. It also admitted L’Opera Bakery Bistro as a show. Those are actual returned records, not hypothetical fixtures.

Loose text matching crossed field boundaries and treated place-name words as activity evidence. Newer inventory readers reused those predicates, so improving retrieval could surface more wrong matches. Existing positive-only examples did not protect against grocery, bakery and park counter-identities.

Other confirmed gaps:

* The homepage retained only 24 events before specialty selection, and removed the featured concert from the secondary list. Specialty rails therefore never had the complete pool to consider.
* Standalone Night Out and Date Night used a different page engine from their homepage dropdowns.
* Summer’s events shelf consumed Viator tours, not dated sports events.
* Today’s discovery composer accepted places only.
* Creator provenance was discarded during pool deduplication and serialization. Grouping the 12-card transport window alone would still hide creators.
* Seven specialty components deliberately rendered empty headings and explanatory copy. Night Out did too.

## Repair contract

| Surface | New behavior |
| --- | --- |
| Night Out | Structured identity vetoes before field-scoped evidence; explicit overlapping membership for music, theater, shows, dinner, karaoke, rooftop and speakeasy plans |
| Night Tours | Cached Viator products selected by a shared night-activity predicate before pagination; existing tracked, link-health-aware purchase links |
| Districts | Exact-ID reads of governed shopping districts alongside the existing pool; ordinary shopping centers cannot qualify by name |
| Date Night | Dated concerts inside Live Music on both entry paths |
| Summer | Real Sports Events replace the invalid tour-backed events shelf and occupy position three; the other nine shelves remain |
| Do Something Better | One additional combined Concerts & Comedy shelf with at most ten eligible events |
| Creator Picks | Explicit creator sources survive serialization; one nonempty shelf per credited creator; bounded continuation requests expose the whole eligible pool |
| Empty shelves | No shell after a healthy zero; pending and failed sources remain distinguishable; existing usable cards survive another source’s failure |

Events require a real destination, valid current date, noncancelled status and coordinates within the existing 27-mile evening radius. Selection happens before the specialty cap and does not exclude the featured concert. Demand-aware order uses existing provider demand or curated popularity fields when present, then the established event-stature/date fallback. This does not change displayed place scores or fabricate sell-out predictions.

The inspected live Sarasota event response contained 46 events and zero demand fields. Availability of popularity data remains a coverage limit, not evidence that every event is equally popular. Curated popularity is now preserved in feed normalization.

## Database and source verification

Read-only production checks confirmed all three district rows are operational, not excluded, and carry ratings and review counts:

| District | Owned place ID | Source |
| --- | --- | --- |
| St. Armands Circle | `ChIJ3VLBF5Jqw4gRkT1TfU3ULd8` | [Circle Association](https://starmandscircleassoc.com/about-us) |
| Main Street at Lakewood Ranch | `ChIJg2IFCAE5w4gRjoL2et_wuBw` | [Lakewood Ranch](https://lakewoodranch.com/main-street/) |
| Waterside Place | `ChIJi43QGNE5w4gRgxvO7rqqJfE` | [Lakewood Ranch](https://lakewoodranch.com/waterside-place/) |

Official district pages were checked during this audit. No new hours or recurring event schedules are inferred. Exact IDs still pass serviceability, distance and photo hydration gates. The audit also confirmed nine cached Sarasota-market products with night/ghost-related words and healthy recorded links; one is a daytime tour mentioning Midnight Pass and is deliberately excluded.

Independent review caught and restored legitimate `irish_pub`, `bar_and_grill` and `amphitheatre` provider variants. Bradenton Riverwalk and Riverwalk East retain their specific waterfront role. Generic parks, splash parks and made-up name matches do not inherit it.

## Protected rules and release

No paid discovery request, new subscription, database mutation or migration was added. The 25-day refresh, 20–27-day jitter, 21-day stock-photo TTL and existing 30-day cap remain unchanged. `night-out:v5` and `menu:v2` invalidate incompatible answer schemas without changing those clocks.

Validation on the final code rebased onto `fdaf98626a68f9796cf1f341062b59ac108d4d8a`: all 613 guards and the additional credentialed re-run passed. After the bundle extraction, guards 1–510 passed in the full runner; a structural assertion was updated to follow the selector's lazy import, and guards 511–613 plus the credentialed pass completed on the same application code. `npm run check:jsx` also passed. Added guards cover real bad records and healthy controls, event eligibility before caps, popularity unknowns, component rendering of empty/loading/error states, creator attribution and paging failure bounds. Existing commerce quarantine and ranking guards passed without relaxing their contracts.

The production build completed compilation, all 544 static pages and final route output with placeholder integration credentials. The final bundle gate passed at 494.4 KB against the unchanged 498 KB homepage limit, with 3.6 KB headroom. The first build had exceeded the limit at 500.6 KB; moving the event selector dependency into the already-lazy poster components removed that regression. Local packaging checks do not substitute for live data and browser verification.

Prepared code is not a live release. Before closure: review final checks, publish the branch/PR with owner authorization under AGENTS.md §11, require hosted CI and preview verification, merge, match production SHA, and recheck the affected public poster flows. Do not call an inventory fixture or HTTP 200 proof of complete production coverage.

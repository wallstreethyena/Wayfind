# Event hub repair, September 6, 2026

Owner authorized takeover of PR #1125, testing and production release.

## Confirmed failure

Production `/florida-events` returned 200 with the empty-success message and zero event links while Howl-O-Scream and Spooky Point detail pages returned real events. Hunsader's page still lacked the address already corrected in the database.

The original draft correctly distinguished query errors from empty lists, but six malformed response cases still returned `[]`. It also rendered a cardless build artifact after skipping its database read. Removing its empty text and JSON-LD did not make that artifact populated.

## Repair

- Validate list and slug response shapes before returning data. A malformed later page throws instead of returning a truncated list. A valid empty array and a genuine null slug remain legitimate empty/missing results.
- Render the hub on demand with `noStore()`, caching only successful validated rows through `unstable_cache` for 3600 seconds. The inner read uses `fresh: true`, avoiding a second stale HTTP cache. No build-time database access is needed.
- Bound database reads to eight seconds. Existing explicit signals remain supported.
- Include `source_url` in the projection and expose a validated verification-source link on detail pages. The new projection also stops reusing the pre-repair HTTP cache entries for the old projection.
- Preserve event eligibility, ranking, the three-card rail floor, affiliate routes, and all owner-protected Places refresh clocks.

## Data verification

Spooky Point's stored schedule already contained an October 13 exception, but four editorial fields still advertised every night. Those fields were corrected through a narrowly scoped update and matched in the seed script.

The official booking calendar at https://selby.ticketapp.org/portal/product/99 was inspected interactively on September 6: October 13 and October 19 were disabled; October 12 and 14 were selectable controls. The calendar does not identify closure versus sellout, so the schedule now states those dates are unavailable in the checked calendar without inventing a reason. Timed entry is 6:30 and 7:45pm; end 9pm; no entry after 8:30pm. The matching seed record is corrected so reseeding cannot restore the conflicting copy.

Hunsader's stored address is `5500 C.R. 675, Bradenton, FL 34211`; no duplicate data update was needed.

No matching Sarasota Cupcake record was found in `wf_events` or `wf_inventory`, nor in repository content. It remains a research candidate. Official ordering guidance: https://www.sarasotacupcake.com/shop and https://www.sarasotacupcake.com/pick-up-options. Order by the dozen at least three days ahead; arrange pickup outside GROVE in Lakewood Ranch or delivery. Do not create a walk-in bakery destination from that pickup point.

## Verification before publishing

- Curated read guard: 39 assertions passed. Malformed list, later-page and slug responses are covered.
- Live-read guard: 16 assertions passed.
- Curated eligibility: 23 assertions passed; event pairing: 16; event ticket deals: 69.
- Restoring the malformed-response fallback makes the new guard exit 1. Removing the runtime-render directive also makes it exit 1. Both mutations were restored.
- JSX check passed; Next.js production build passed. Build output marks `/florida-events` dynamic and has no static hub entry in the prerender manifest.
- Built application exercised with four synthetic verified events: first and second HTTP requests both returned 200 and four unique event links, with exactly one database read total. That inner read carried `cache: no-store`.
- Bundle: 488.9 KB gzip against 492 KB budget.
- The local full guard process ended without a final summary; it is NOT counted as a pass. GitHub CI and Vercel must both pass on the final commit before merge.

Production verification is required after deployment; the above runtime test used synthetic data, not production data.

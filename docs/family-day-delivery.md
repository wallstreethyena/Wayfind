# Family Day, Solved implementation

Prepared and committed on isolated branch codex/family-day-rails from d38386b87c8739ca96b483454950118a767c2be3. Not pushed, merged, deployed, or verified live.

The homepage poster now links to /family with the selected location. The page has ten horizontal rails, evidence-based filters, explicit unknowns, 10/25/50-mile choices, and per-rail retry/deadline handling. Places use the existing IconicPlaceCard and governed score. Events use the existing curated-event eligibility and ranking, with separate scoreless event cards.

## Owned inventory verification

The read-only inventory snapshot contains 1,384 Florida-bounded candidates meeting the existing family floor (4.5 stars, 500 reviews), OPERATIONAL and not excluded. Counts below are computed against that snapshot, before the page display cap. They are venue-category matches, not proof of age suitability or public access at a future visit. Multi-rail venues may appear more than once.

| Rail | Florida | Sarasota 25 mi | Orlando 25 mi | Miami 25 mi |
|---|---:|---:|---:|---:|
| Beach Days | 77 | 26 | 0 | 9 |
| Theme Parks & Attractions | 47 | 0 | 29 | 3 |
| Water Fun | 11 | 0 | 5 | 1 |
| Animals & Aquariums | 28 | 2 | 4 | 1 |
| Outdoors & Wildlife | 473 | 43 | 59 | 81 |
| Museums & Indoor Play | 166 | 13 | 39 | 36 |
| Space & Big Learning | 4 | 0 | 1 | 1 |
| Sports, Games & Active Fun | 46 | 9 | 12 | 3 |
| Events, Culture & History | 54 | 7 | 9 | 6 |
| Family Food & Entertainment | 144 | 18 | 40 | 33 |

## Data and trust

FamilyDayData reuses readOwnedCategory, with exact distance checks, category matching before output caps, a shared short-lived category promise cache, and explicit truncation. No Google calls, new provider, migration, or recurring job. Existing 25-day refresh, 20–27-day cache jitter, 21-day stock-photo TTL and score rules are unchanged.

Fifteen exact-ID official-source overlays add only supported planning facts; sources and limits are in family-day-evidence.md. Missing admission prices remain unknown, never Free. Adult/nude, dog-park, RV/campground and axe-throwing exclusions protect the broad family browse. Specific active venues are separated from theme parks.

Only explicitly family-tagged, eligible upcoming curated events enter the event subrail; adult restrictions override family tags. Event source failures are displayed separately from permanent venue results.

## Remaining limitations

- Browser verification is blocked: local Chromium is absent, download failed, and the connected browser rejects localhost with ERR_BLOCKED_BY_CLIENT. A hosted preview must be checked before merging.
- Broad inventory classification is not a venue-by-venue audit of access, minimum heights or facilities. Only the fifteen sourced overlays support planning filters for places.
- The 4.5/500 quality floor leaves genuine local gaps, especially water and space. Do not fill these with unrelated or distant cards.
- A read-only database count found 300 curated events, including 201 tagged families or kids. These counts are not eligibility or nearby-result counts. The new endpoint has not yet been exercised against that live feed; event trust/filter behavior is tested with fixtures.
- Official planning overlays expire on 2026-10-10. Expired facts stop matching filters until reverified.
- No rendered map was added to this scoped page; each place opens its existing detail and navigation flow. Distances are miles, not guessed drive minutes.

## Verification evidence

- Final full run: `node scripts/run-guards.mjs` returned 0, reporting 603/603 guards plus one credentialed rerun green in 163.0 seconds. Browser-dependent guards explicitly skipped because Chromium is unavailable; this does not establish browser verification.

- The final production build completed, generating 541 routes with the required placeholder configuration. JSX checks passed, including an explicit check of the new FamilyDayPage component. Placeholder inventory lookups are not live-data verification.
- All three family guards pass: taxonomy; owned-inventory identity, floor, geography, order, deduplication, unknown facts and missing configuration; and 24 curated-event assertions.
- Five isolated renders of the real FamilyRail function verify normal cards, hiding ready cards while weather is paused or unsettled, and explicit capped-search empty messaging. Reverting the readiness gate reproduces stale visible cards. Hooks and the child card were stubbed; this is not browser verification.
- Removing the primary-identity veto from a temporary taxonomy copy causes the restaurant-as-beach assertion to fail; the original passes.
- The existing pin-quarantine guard repeatedly counted leftover compiler directories as this card’s graph. The test compiler now exposes its exact source-to-module mapping, and the guard reads its own card store directly from that mapping. It no longer searches temporary directories, which can include earlier or concurrent compiler output. Its 60 assertions pass, including the rendered removal of retired booking links.

## Release gate

Local guard, JSX and production-build gates passed. Main subsequently advanced to d0fbcce4 (Sarasota fall publication, #1255); its changed files do not overlap this branch. Its curatedEvents change adds source_type to the read/cache identity. Integrate current main before hosted acceptance. After owner approval under AGENTS.md section 11, push/open a preview PR, verify mobile poster navigation, all rails, filters, retries and place/event links against real configuration, then merge/deploy only after those checks pass.

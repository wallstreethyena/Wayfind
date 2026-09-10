# Sarasota Fall 2026 publication

The reviewed brief contains 30 distinct public events within 30 miles of the
Sarasota reference point (27.3364, -82.5307). This release adds four curated
events, corrects 25 existing canonical records and retains The Vampire Circus
on its existing provider route. It does not create 30 duplicate event rows.

The complete source evidence, verified schedules, venue coordinates, taxonomy,
canonical routes and separate rejected/held candidate ledger are in
`scripts/fixtures/fall-sarasota-publication-2026-09-10.json`.

## Publication behavior

| State | Events | Result |
| --- | --- | --- |
| Add | Siesta Key Scarecrow Stroll, Hocus Pocus Pops II, Wellen Park Spooktacular | Canonical event page and family rail, subject to the existing location and image gates |
| Add with photo hold | Runaway Pumpkin 5K & Family Fest | Canonical event page; no fall rail card until a verified image is available |
| Correct existing | 25 records named in the fixture | Preserve event IDs, slugs, provider identities and mutable link health |
| Retain provider | The Vampire Circus | Keep `/events/sarasota/the-vampire-circus--tm_Z7r9jZ1A7PbaS`; no curated duplicate |
| Photo holds | Runaway Pumpkin, BayFest, Hunsader Pumpkin Festival, Candlelight Halloween, Sun Fiesta | Publish event facts; keep off the fall rails because no exact owned or rights-cleared image was established |

Runaway is 28.11 miles from the Sarasota reference point. Its family rail cap
remains 27 miles, so resolving its photo makes it eligible from North Port and
other closer origins, not from central Sarasota. The research radius remains
30 miles. Ranking, rail radii and paid-provider controls are unchanged. Venue heroes use
verified existing 640-pixel photos, with the working 800-pixel entries retained
for Fruitville Grove and Downtown Wellen Park. Sun Fiesta has no fresh cached
photo at any width and its permanent-photo candidate was rejected for identity
disambiguation, so its page keeps the named fallback and its rail card is held.
No new paid image requests are needed.

Freedom Factory remains in festivals: child tickets do not make loud demolition
racing a gentle family Halloween recommendation. Venice Night Market follows the new verified family Halloween classification.
Sharktoberfest uses the Oktoberfest rail and retains its verified 21+ policy.

## Material corrections

UTC now links to its September 17 Tailgate Edition instead of a May 2025 market.
Hunsader, Downtown Wellen Park, the Opera House and Sarasota Medieval Fair use
the verified venue coordinates. BayFest uses a Pine Avenue corridor anchor,
without assigning the event to the shop used to establish that anchor.

Candlelight uses the October 24, 6:15pm session, 60-minute duration and doors
one hour before. Carrie carries selected performance dates without claiming
the conflicting room or curtain times. Wellen Spooktacular follows the
organizer's 4–7pm schedule without a free badge. Freedom Factory uses the
current $30 Friday/$35 Saturday adult prices. Medieval Fair retains December 6
as the true closing date. Lights at Spooky Point preserves the October 13
closure without calling an unavailable ticket session a cancellation.

## Apply and verify

`node scripts/seed-sarasota-fall-2026-publication.mjs --dry` validates the manifest.
`--sql` prepares one transaction for the authenticated database connector.
The transaction rejects missing canonical targets and ID/slug collisions.
It locks existing targets and rejects concurrent changes to any reviewed field.
New IDs use insert-or-keep with exact field assertions, never overwriting a
concurrently created event. It changes only listed event facts and never writes
the link-health columns.
This fixture supersedes older research/seed facts for these 29 IDs. Both older
Sarasota and Gulf Coast seed executables skip superseded IDs, and the Gulf
Coast seed rejects an explicit `--only` request for one of them.

The existing fall intent regression guard executes all 29 curated taxonomy
decisions, composes the exact 24 photo-ready Sarasota cards, proves the
Runaway distance boundary, and checks identity, image-hold and health-field
preservation. The cache moves to v12 so the corrected rail composition is
served immediately after deployment.

Production completion requires field-by-field database readback, a merged
commit, a ready production deployment and live event-page and rail checks.

# September 9 follow-through

## Verified repairs

- Beach forecasts now include the in-progress hour. A storm at 10:30 must not
  disappear because its forecast period began at 10:00. Unknown alerts and
  reported hazards still suppress better-weather suggestions.
- NWS point-specific alerts retry once for transient failures, with bounded
  timeouts and Retry-After handling. Malformed/paginated feeds never become a
  misleading empty alert list. This reduces transient failures, not a promise
  that NWS is always available.
- Local flag/closure links now lead to county-selected reports. Live flag and
  closure ingestion is **not connected**. Unknown stays explicit. Manatee County
  identifies Safe Beach Day and its 10 a.m./3 p.m. update cadence:
  https://www.mymanatee.org/services-and-amenities/service-listing/service-details/check-beach-conditions
  The public page exposes a color legend without an unambiguous current dated
  flag in the retrieved HTML. Reading that legend as live flags would be wrong.
- Editorial retry previously called a two-argument RPC that updated issues and
  verification but never stored the newly generated prose. The new additive
  `wf_editorial_record_attempt_content` RPC saves the complete row and lifecycle
  atomically, keeps existing publication constraints/triggers, and cannot replace
  an already-published row. Only service_role may call it; security invoker.
  Retry, insert, and refresh counts now report persisted publication outcomes.
- Photo monitoring mixed new queue rows (with status) and existing rows (without
  status) in a single JSON bulk upsert. This violates PostgREST's homogeneous
  object-key contract. Two homogeneous batches preserve the deliberate omission
  of status for existing rows, so retired/unresolved decisions are not reset.
- Python separates zero-attempt failures from genuine idle runs, adds a latest
  24-hour view, and retains excluded/closed duplicate pairs outside the active
  review queue. Full input count validation and fail-on-truncation remain.

## Duplicate review disposition

Production records checked September 9:

| Pair | Disposition |
| --- | --- |
| Riverwalk Splash Park / splash pad | Duplicate pin already EXCLUDED with explicit duplicate_of link. |
| Dezerland Park Orlando | Duplicate pin already EXCLUDED with explicit duplicate_of link. |
| Kennedy Space Center | Affiliate-import duplicate already EXCLUDED with explicit duplicate_of link. |
| Siesta Beach | Duplicate pin already EXCLUDED; canonical row separately needs review. Do not clear that flag by assumption. |
| Sadelle's / Isabelle's Coconut Grove | Distinct venues. Current names differ; official sources give separate locations. Do not merge. |
| Ephesus Mediterranean Delights / II | Unresolved. Nearby coordinates and similar names do not establish identical premises. Preserve both pending authoritative address/identity evidence. |

Official distinct-venue sources:
https://sadelles.com/coconut-grove-contact
https://www.isabellescoconutgrove.com/contact-location

No inventory records were deleted or merged by this change.

## Current provider and photo evidence

At 14:23 UTC, Yelp, Foursquare, and Tripadvisor each recorded zero attempts,
zero successes, zero failures. Notes explicitly identify parked Yelp/Foursquare
and retired Tripadvisor. Historical failures are not current outages. No paid
provider was enabled.

The 329 photo-repair successes in the earlier audit meant **329 classified,
zero recovered**, according to the actual pulse notes. They did not mean 329
fixed images. The queue write fix enables bookkeeping; it does not buy photos.

## Editorial backlog and limits

Of 17,017 operational/unflagged records without wf_editorial at the follow-up
read, 1,367 already held inventory.editorial or inventory.editorial_card.
15,650 held neither of those nor wf_editorial. This still excludes other static
Atlas lookup sources, so it is not a website-wide blank-page count.

The retry persistence fix does not by itself write thousands of descriptions.
Existing source/verification gates and spending policy remain. Usage caps were
not raised or reset. Live flag feeds, remaining identity research, and wholesale
sourced editorial expansion remain separate work, not claimed complete.

## Verification

- New alert recovery guard exercises transport failure, 503 recovery, 429
  backoff, malformed/truncated feeds and the in-progress storm hour.
- Editorial retry guard exercises complete payloads, effects, no-op, invalid
  counters and write failures.
- Database transaction test saved fixture prose and facts, checked counter
  increment and concurrency protection, rejected a thin hook and checked grants.
  All fixture changes rolled back. The additive migration was then applied and
  production function privileges verified (anon/authenticated false, service true).
- Photo queue regression reproduced HTTP 400 with a mixed-key fixture before
  the change, then passed with both records retained and retired status omitted.
- 79 Python tests pass with the locked all-extras test environment.
- Full guard/build/CI and production verification are required before completion.

The follow-up snapshot at 14:55 UTC validated 20,086 places, 2,938 job runs, and 14 ledger records. Four excluded-record pairs were separated. The Sadelle’s/Isabelle’s decision is now identity-scoped in the package; if their names or category change, the pair returns to review. Raw snapshot deleted after analysis.

# Poster speed rollout

Baseline: main and production `f79c93395879b653d5d565ff8934af6efba6a354`, reviewed 2026-09-10. Production deployment: `dpl_9nuAhZyWknKj4V8vfKKHe4TYbUJS`.

Prepared on main `2c0d3d6` after integrating the guide SEO change. No shared remote branch has been changed.

## Coverage

The visible menu has 15 posters. Do not count retired or hidden tiles as visible coverage.

| Poster ID | Loading path | Speed treatment |
| --- | --- | --- |
| season | SummerIntentRails, summer/places and experiences | Selected module preparation; public Summer answer reuse; companion request keeps existing policy |
| today | TodayDiscoveryRails, today-discovery | Selected module preparation, public answer reuse |
| trending | ExplodingNearby, Places walk and owned fallback; shared list | Selected module preparation, existing progressive results; shared server improvement |
| eat | WorthEatingRails, shared rails | Selected module preparation, shared server improvement |
| beach | Shared rails and conditional water chips | Shared server improvement; water policy unchanged |
| family | Shared rails | Shared server improvement |
| locals | Shared rails | Shared server improvement |
| cindy | Native creator page navigation | Existing page delivery; no new poster API or in-page stopwatch |
| tonight | NightOutRails, night-out | Selected module preparation, public answer reuse |
| datenight | DateNightRails, date-night | Selected module preparation, public answer reuse |
| break | Local shared pool plus lunch-break | Selected module preparation, public answer reuse |
| breakfast | BreakfastRails, shared rails | Selected module preparation, shared server improvement |
| birthday | BirthdayRails, birthday | Selected module preparation, public answer reuse; existing idle warm retained |
| blog | Already supplied guide cards | No new fetch; shared visible-card stopwatch |
| augtober | FallIntentRails, events/fall | Selected module preparation, public answer reuse, incomplete-cache repair |

All in-page poster results use the same visible-card measurement boundary. Native creator navigation needs the existing page-vitals measurement instead. This is coverage by appropriate path, not a claim every path has the same bottleneck.

## Changes and limits

* After one inventory prime, city and nearby readers share an eight-worker queue. Result merging remains in its original deterministic order. The same read cache, queries, category membership, thin-area fallback and trend tails remain. No database index or schema change is justified by this evidence.
* Selected public JSON requests have high browser fetch priority. Pointer/focus preparation requests only the relevant lazy component chunk. It does not fetch every poster's inventory.
* Healthy public JSON can be reused in the current browser module for 30 seconds, with at most 16 entries. Exact URLs, deadlines, retry policy and priority form the identity. Custom request options and mutations bypass reuse. Each caller gets a clone. Incomplete or unmarked page responses are not retained. This is separate from inventory and photo refresh clocks.
* Fall's shared cache and CDN now refuse results with nonzero or unknown sourceFailures. Current known-good entries remain valid. Old entries without evidence must rebuild.
* Existing ranking still builds a complete answer before paging. Skipping independent rail builders may alter cross-rail selection or deduplication. This rollout does not claim selected-only cold computation. Summer still waits for both sources before composing its final list. A later change needs output parity and interaction tests, not just a smaller response.

## Evidence and measurement

Production before this change, Parrish, 17:59:25 UTC: shared server compute 4,250 ms; inventory prime 884 ms, ranked 415 ms, nearby 678 ms, other parallel pools 1,379 ms, morning pools 442 ms, selection 52 ms, editorial 399 ms. This is one server sample, not a percentile or an after-change result.

The public baseline completed ten endpoint probes: eight healthy nonempty responses, two 403 responses from the tool environment (Summer experiences and Trending fallback). The connected browser subsequently rendered both Summer and Trending results for its displayed Tampa location. That is a baseline interaction check, not evidence for this branch or for Parrish. Tool wall times include network/proxy delay and are not server timings. The audit records cache state and health separately from HTTP success.

* `poster_visible_timing`: `rail_id`, city, daypart, outcome and elapsed_ms. Starts at the open action and reports the first real place/guide card intersecting the viewport after an animation frame. It excludes skeletons and hidden tabs. This is card visibility, not photo decode completion. `abandoned` and `no_card_observed` must remain in reports; do not use only successful fast visits to judge reliability.
* `poster_json_request_timing`: allowlisted endpoint path, cacheState, elapsedMs, failure. No query string or coordinates. This measures JSON delivery, not rendering.
* Server `[rail-answer] timing`: safe static name, cacheState, outcome, elapsedMs, usability, and loaderMs when that loader has actually settled. Shared-build duration is not billed once per caller and late hits must not claim unfinished loader duration.
* Server `ranked-nearby` is one joint stage because the two read types now overlap. Do not sum their former sequential timings as if they were still independent wall time.

Suggested follow-up goals remain proposals: cached card display under one second and uncached display under three seconds at the 95th percentile. Collect enough real visits per poster and device class to judge these. Do not label one to five synthetic samples as p95 proof.

## Verification and release

New blocking guards cover reuse/expiry/location separation, incomplete cache rejection, timing outcomes, pool output parity and bounded concurrency. The old serial shape and deliberate real-source mutations must fail their controls. Existing guard registry and manifest stay synchronized.

Before release require the full guard runner, JSX check, production build, bundle budget, and rendered mobile checks on the exact release revision. The local browser download timed out. The connected browser works for the public site but refuses the local server with ERR_BLOCKED_BY_CLIENT. Rendered verification of this branch therefore requires a hosted preview. Repeat production probes after deployment and confirm deployment SHA before comparing results.

Open PR #1249 owns outage recovery. Its client import changes overlap this branch. Integrate the chosen release order explicitly and rerun the client recovery and reuse guards; do not overwrite either behavior through conflict resolution. Its current reviewed head was `765f7dbba7516135a0d2d5eddc71042669829568`.

No changes to score ordering, location and intent rules, refresh after 25 days, existing 20–27 day jitter, 21-day stock photo expiry, 30-day content cap, booking actions, paid-provider access or recurring jobs.

## Local verification record, 2026-09-10

* Full runner exited 0: 606/606 guards plus one credentialed rerun, 172.6 seconds. Browser-dependent layout/interaction checks, OG fetches without OG_BASE, and live deal-art assertions without Supabase credentials reported skips. These are not browser or live-data passes.
* `npm run check:jsx` exited 0. `git diff HEAD --check` passed.
* The clean production build generated its complete route report. The process polling tool lost its final exit status with a network-approval cancellation, so the log is evidence of completed build output, not a captured exit-0 assertion. An earlier build captured exit 0 before the final lazy-loading adjustment. Hosted CI must confirm the exact final build.
* The final real build assets passed `node scripts/check-bundle.mjs`: 496.7 KB total gzip against 498 KB, with 1.3 KB headroom. The existing guard warns that this is below its preferred 2 KB margin; hosted CI is still required. No budget was raised.
* The final full run passed the new request-reuse, cache-timing, real-card timing, pool-parity/concurrency and Fall-completeness guards. Existing booking, location, ranking and recovery guards stayed enabled.
* Earlier runs exposed leftover generated JSX test directories from previous runs. Moving those temporary outputs out of the worktree allowed the unchanged pin-quarantine guard and the complete suite to pass.

Release remains pending owner approval under AGENTS.md §11, hosted browser checks, and reconciliation of the overlapping outage-recovery PR. No after-change production speed measurement exists yet.

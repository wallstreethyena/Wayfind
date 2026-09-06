# Place-card poster review, September 6, 2026

Base reviewed: `9501003` (`origin/main`, PR #1117 merged). This is a review and repair branch; it is not evidence that the repair is deployed.

## Confirmed incident

Production Vercel logs show twelve `/api/night-out` HTTP 503 entries in the six-hour window ending 03:57 UTC. The current deployment's 03:52 entry reports `All Night Out inventory reads failed: The operation was aborted due to timeout`. Birthday logged two 503 entries, both database timeouts, on the earlier production deployment. The screenshot's service-error text matches the NightOutRails failure branch.

A successful public Parrish probe returned 424 qualified Night Out candidates with all three category reads successful. The subsequent reproducible Python audit, using a different rounded town centre (27.58, -82.43), returned 418. These are distinct probe locations, not a before/after repair comparison. The failure is intermittent; the owned inventory exists.

## Repairs in this branch

* An opt-in GET retry handles one 502/503/504 within the existing total client deadline. Applied to Night Out, Birthday, Date Night, Today and Summer's owned-place read. No retry of mutations, auth failures or paid-provider reads by default.
* Simultaneous cold requests for the same public rail-cache key share inventory computation in one process. Different cities remain independent. Rejected loaders are removed; references to a loader that never settles expire after 20 seconds. This reduces duplicate work; it does not eliminate database outages or coordinate across separate server instances.
* Night Out uses one request identity for its effect and URL. Previously an exact-coordinate update inside the same rounded cell cancelled the response handler while `asked.current` refused its replacement. Old-city remote payloads are now hidden immediately, malformed successes become errors, and missing coordinates request a location.
* Six dedicated poster effects can restart after cleanup: Night Out, Birthday, Date Night, Today, Fall and Summer. Date Night also clears its previous error/data and provides a retry button.
* Summer distinguishes two successful empty responses from an unavailable/malformed source. The live Washington browser rendered a service-error message despite a successful Summer API read; the incorrect empty-as-error branch is separately reproduced with deterministic fixtures.
* A pre-existing full-suite failure searched rendered HTML for unescaped business names. Reproduced on unchanged main. Its positive control now renders the expected name with React's own escaping; the geography rule remains intact.
* Sentry build telemetry is explicitly disabled; source-map upload was already disabled. This allowed the build to run after automatic approval review rejected an external build-telemetry attempt. Runtime error monitoring configuration is unchanged.

## Python evidence

`python scripts/audit_poster_routes.py --cities Parrish Tampa Miami --output <report.json>`

Two workers, read-only public GETs, 25-second request ceiling, exact planned/completed request count, incremental report writes. No credentials or raw place payloads are recorded. Times include the audit client's network overhead and must not be presented as isolated server latency.

The initial audit completed 27/27 probes. Twenty-four returned HTTP 200. Three Trending probes returned 403 at edge middleware because that endpoint requires the browser's same-origin request context. This is a limitation of that probe, not evidence that Trending is broken. Its real browser flow reached a legitimate empty state in Washington.

The first shared-route parser did not unpack the `data` envelope. It was corrected and all three shared routes were rechecked. The supplemental report contains their actual per-poster counts. Do not interpret the initial shared-route zero counters as missing inventory.

| Dedicated data route | Parrish | Tampa | Miami |
| --- | ---: | ---: | ---: |
| Night Out, first delivered card windows | 89 | 84 | 69 |
| Birthday, first delivered card windows | 50 | 31 | 32 |
| Date Night, first delivered card windows | 56 | 54 | 60 |
| Today, first delivered card windows | 110 | 112 | 84 |
| Fall, first delivered card windows | 42 | 36 | 0 |
| Summer, owned places | 45 | 47 | 7 |
| Lunch Break, owned places | 57 | 136 | 120 |

These counts measure different response shapes, not comparable recommendation quality or unique inventory recovered. See JSON evidence for precise schemas and source health.

## All 18 active posters traced

| Poster | Actual source and review result |
| --- | --- |
| Fall in Florida | Dedicated Fall route: cards in Parrish/Tampa; all ten Miami rails empty, no reported source failures. Empty inventory needs a separate coverage review. |
| Night Out | Dedicated three-category inventory: live timeout confirmed; healthy probes in all three Florida cities; request-race and recovery tests added. |
| Trending Near You | Curated/provider trend loader plus owner floor; raw non-browser floor probe blocked by middleware; browser reaches explicit empty state. Existing pending-load hardening is in open #1114. |
| Date Night | Dedicated Date Night route: cards in all three cities; browser paints Dinner and Dessert; error reset and retry repaired. |
| Summer Picks | Dedicated Summer places plus affiliate activities: owned places in all three cities; empty-versus-error handling repaired. |
| Today's Best Options | Dedicated Today route: cards in all three cities; browser renders activity and food cards; effect restart tested. |
| Lunch in My City | `/api/lunch-break` POST reveal; read-only GET pool populated in all three cities. Existing POST has a ten-second abort, daily allowance and server tracking. This audit did not consume a reveal or claim end-to-end POST verification. |
| Actually Worth Eating | Shared rail pool feeds its cuisine composer. Twelve initial `eat` candidates in each Florida city. |
| Chef Ron Duprat's Top 7 | Static `RON_DUPRAT_TOP7` through `chefPickPlaces`; independent of Night Out's database read. |
| Locals Know | Shared pool: twelve first-window candidates in each Florida city. |
| Worth the Drive | Shared pool: twelve first-window candidates in Parrish/Tampa, zero in Miami; separate coverage finding. |
| Birthday Plans, Solved | Dedicated route populated in Florida; live timeout evidence and restart tests as above. |
| Family Day, Decided | Shared pool: twelve first-window candidates in each Florida city. |
| Beach Day | Shared pool: twelve first-window candidates in Parrish, zero in Tampa/Miami. Requires radius/eligibility analysis before calling this missing inventory. |
| The 30-Minute Break | Dedicated Lunch Break read plus shared seeds; GET results populated in all three cities. |
| Best Breakfast Picks | Shared pool feeds breakfast composer: twelve first-window candidates in each Florida city. |
| Your Next Coffee Spot | Creator page `/creators/cindy.selects`; shared creator pool has six Parrish candidates, zero Tampa/Miami. Geographic emptiness is not a service outage. |
| Local Guides | Editorial guide list and `/guides`; not the Night Out inventory reader. |

This is full poster source coverage, not a certification that every card image, save/share action, mobile viewport, or location-selection flow passed end to end. Browser checks used the environment's Washington location, except a direct Parrish `/tonight` page, which rendered Peggy's Corral and 88 Live Piano Bar. Florida endpoint checks used explicit named town centres.

## PR reconciliation

* #1117 is merged. Preserve its identity-before-cap retrieval, exact radius and serviceability gates.
* #1114 is open and mergeable at review time. It covers separate pending-load surfaces (ExplodingNearby, IntentRail, IntentPageClient, TrendingNowClient) and promo-location honesty; do not duplicate or discard it.
* #1111 is open with conflicts at review time. Broad reliability/guard work remains pending; it is not already protecting production merely because the PR description reports local test success.
* #1118 and #1115 remain separate open work. This branch does not merge those lanes.

## Release limits

The timeout fix is recovery and load suppression, not proof that every underlying database query is fast. Cold first requests can still exhaust the deadline. Partially successful category reads also need a separate cache-health review because their health flags do not currently exclude every partial answer from persistence. No change here widens predicates, radius or quality thresholds, or changes the owner's refresh clocks.

## Verification record

* `test-poster-recovery.mjs`: 31 assertions pass. The cache-concurrency assertion fails against unchanged main, proving the regression check distinguishes the original implementation.
* Existing Night Out intent: 59 assertions; identity-first read: 24; Date Night intent: 165; seed swap/paging: 23; corrected composition render: 43. All pass.
* `npm run check:jsx`: exits 0.
* The manifest contains 525 distinct commands. The canonical runner was observed through `check-experiences-link-health`, but its session ended without the runner's final completion marker. All 35 remaining commands were therefore executed individually with an asserted planned/completed count; zero failed. The separate credentialed control also passed 1/1. This is split-run verification, not a claimed uninterrupted canonical-suite completion. CI should complete the canonical gate before merge.
* A production build with build telemetry disabled passed and measured 488.7 KB gzip against the 492 KB budget. A later rebuild hit `ENOTEMPTY` cleaning `.next/export`; the prior build directory was preserved and the final clean rebuild completed successfully (exit 0), with the same 488.7 KB bundle measurement.
* Browser confirmed the creator coffee page contains linked place cards; Local Guides contains editorial links; the Lunch in My City poster opens the challenge and its reveal control. No daily reveal was consumed.

No database changes, production deployment, refresh-clock changes, or assertions of universal card-image correctness are included in this review.

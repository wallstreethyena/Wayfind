# Metered-job incident repair, October 18, 2026

## Scope and baseline

Owner requested repair of all four jobs in the 03:45 ET incident email.
Baseline main and production: `53b62665fe3033cb6ca70ea9cf2318f743edea34`,
Vercel `dpl_7PnrctG7wrKrVQy61U14Tat8jA1M` (READY, inspected through API).
Production evidence was read from Supabase project `gbhtoehdxkzjsmmkisgu`.

## Repairs prepared

1. **experiences-link-health:** the probe runner reserved pacing slots for all
   remaining rows after its deadline. A deterministic 400-row reproduction took
   99,750 ms despite a 30,000 ms deadline. It now ends at 29,750 ms with 120
   probes completed and 280 rows untouched. The route includes the initial read
   in its budget, bounds fetch bodies and total persistence, cancels subsequent
   work after watchdog expiry, and gates all exits on one pulse request. Partial
   runs report `left`; unknown and throttled products are never marked dead.
2. **social-intelligence:** the only two stored leads were already promoted
   (`owner-20261013-naree-tampa`, `owner-20261013-forbici-st-pete`). Requalifying
   closed history created repeated failures. Promoted/rejected history is now
   explicitly skipped, including identity reads. Active attempts remain counted;
   actual qualification, configuration, and database failures stay visible.
   Publication remains disabled and no paid acquisition is introduced.
3. **affiliate-coverage:** Zoo Lights Miami has separate evening admission.
   Tiqets' exact product p1080713 is unavailable; daytime admission is not an
   equivalent product. Added an existing-contract reviewed no-product decision,
   valid through November 1, 2026; the alert returns November 2 if no verified
   mapping or renewed review exists. Organizer links remain intact. Also fixed
   the cron's obsolete coverage-state enum and preserved legacy response aliases.

Evidence: https://www.tiqets.com/en/miami-attractions-c79868/tickets-for-zoo-lights-at-zoo-miami-p1080713/
was independently opened on October 18. It states tickets are unavailable,
includes evening admission, and excludes daytime admission. The official event
page could not be freshly read; the stored October 13 organizer verification
also identifies separate ticketing. No new date verification is claimed.

## Remaining event-truth blocker

`wf_heartbeat_expected` identifies an external Claude scheduled task
`trig_01RR7eEeKwEeFxtPm7KUhHpL`, daily at 08:07 America/New_York. Both
`event-truth-daily` and `event-truth-sla` last pulsed October 15 at
12:18:27.69639 UTC. Expected maximum staleness is 1,800 minutes.

There is no corresponding repo job, Supabase cron, or connected ChatGPT task.
Connected-tool discovery and plugin search did not expose management of the
original Claude scheduler. Its exact prompt and execution history are not
available. No replacement with guessed research/publication behavior was made.
No heartbeat was fabricated, no verification timestamp was advanced, and no
staleness threshold was relaxed.

A production count on October 18 found 268 ongoing or next-seven-day scheduled
or sold-out rows with null verification or verification older than 72 hours.
This is a freshness backlog count, not a claim that 268 events are incorrect.
Repair requires access to the original task, inspection of its instructions
and failures, restoration of its schedule, real source verification, and a
post-run SLA query. The alert intentionally remains unresolved until then.

## Verification

- Link-health guard: 119 assertions, including deadline redproof, hung read/body,
  late read resolution, total PATCH budget, one pulse, and bounded pulse notes.
- Affiliate coverage guard: 239 assertions; obsolete enum and expired decision
  mutations both fail. Event-ticket guard: 215 assertions; fallback: 27.
- Social guard executes real route/readers with terminal, active, mixed, empty,
  configuration, transport, and authorization cases. Both terminal reprocessing
  and inspected-as-attempted mutations fail. Hermetic fixture uses explicit env.
- Pulse contract: 446 assertions; pulse-health tests: 83 assertions.
- Local patched tally over 995 current production event rows: 21 mapped,
  5 reviewed no-product decisions, 969 no-partner, 0 unmapped, 0 missing URL.
  This is a production-data replay, not an executed deployed cron.
- Astra independently reviewed all three repairs and reran focused guards.
  Jev tools were not exposed; no Jev review is claimed.
- JSX check and final production build passed with documented placeholder
  credentials. Bundle check passed: 488.9 KB gzip, 9.1 KB below its limit.
- The full suite stopped at guard 516/925, `check-place-card-standard.mjs`.
  Its 19 button-text/font geometry failures were reproduced on untouched main
  `53b6266` in a separate worktree; the two nonempty failure lists match exactly.
  This repair does not edit card components or their styles. The full suite is
  NOT green, and later checks did not run in that suite invocation. The gate
  was not weakened or skipped.
- GitHub publishing was rejected by automatic approval review: it requires
  explicit owner authorization to send this source/audit to
  `wallstreethyena/Wayfind`. No PR, merge, deployment, or live cron recovery is
  claimed. Release remains blocked pending publishing permission and required
  hosted gates. The CRON_SECRET is sensitive and was not returned by Vercel's
  authorized environment read, so a manual authenticated live invocation also
  remains unavailable; no secret was printed or changed.

In-flight database requests may commit despite client cancellation. Already
saved health updates remain saved if a later write fails; that run still reports
failure. Pulse waiting is bounded but an already-started pulse write may finish
later. No new provider, spending limit increase, or Google request is introduced.

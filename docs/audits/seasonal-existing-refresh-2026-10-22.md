# Existing seasonal entry refresh, October 22, 2026

Status at package commit: locally tested release candidate; hosted checks and production verification remain. No production write or deployment is recorded by this package.

The owner approved release after the complete guard suite, browser proof and CI are green. This package refreshes existing IDs. It creates no event or venue and preserves ticket identity, coordinates, photos, scores, ranking, card dimensions, refresh/shuffle rules and provider costs.

## Supported changes

| Existing entry | Change and reason | Primary evidence checked October 22 |
| --- | --- | --- |
| Guppyween | Public October 24–31, 9am–5pm stays unchanged. Name the three candy dates and distinguish the October 23 members-only reservation and October 25 sensory-friendly early admission. | [Florida Aquarium](https://www.flaquarium.org/news-events/attend-an-event/calendar/guppyween/) |
| Tampa Halloween Bar Crawl | October 31, 3–10pm; check in at MacDinton's SoHo 3–5pm; seven stops. Remove superseded five-bar, 4–6pm and midnight-after-party display copy. Preserve existing ticket ID 1583901996509. | [Crawl With US](https://crawlwith.us/tampa/halloween/) |
| Crystal River Scarecrow Fest | Correct the completed October 10 database row to scheduled October 31, 10am–3pm. Derive display summary from the schedule so the former 5pm close cannot remain. | [City rescheduled event](https://www.crystalriverfl.org/special/page/scarecrow-fest-rescheduled), indexed source retrieved October 22, crawled six days earlier. Direct fetch unavailable. This primary rescheduled page supersedes older 5pm city/tourism copy. |
| Legends of Oblivion | Restore scheduled status through October 25. Exact nights: October 9–11, 16–18 and 23–25; Friday/Saturday 8–11pm, Sunday 8–10pm. The first-date-only rollover incorrectly completed the continuing event. | [Organizer](https://www.hauntedswfl.com/buytickets) and its linked [2026 calendar](https://static.wixstatic.com/media/823e3f_df5eaaccfd1941508564ee66ef1a0360~mv2.png), visually inspected |
| ZooTampa Christmas in the Wild | Access warning only: November 27 is the members-only preview. Public nights remain unconfirmed and held. No date, time, status, ticket-status or confidence promotion. | [ZooTampa](https://zootampa.org/events/christmas-in-the-wild/) |

## Protected holds and identities

- ZooTampa's actual database ID `zootampa-christmas-wild-2026` maps to the research alias `zootampa-christmas-in-the-wild-2026`; the actual database snapshot remains excluded by the real Christmas composer.
- No ADD records are released. The original audit's other candidates, review flags and unverified menu offers remain outside this package.
- Existing event review statuses are not overridden by the shared visit facts. Only the guarded, approved database corrections restore Scarecrow and Legends to scheduled.
- The Fall feed cache epoch advances from v39 to v40, and the shared schedule facts participate in the feed content hash. Cache durations do not change.

## Release plan and evidence

| Acceptance gate | Owner | Required proof |
| --- | --- | --- |
| Source and scope review | Root + independent Astra reviewer | Verified primary dates/access, same IDs, Zoo public-night hold |
| SQL safety | Root + SQL executor + independent reviewer | Actual forward/reverse SQL executed on isolated PGlite fixture; exact row/version guards and rollback controls |
| Complete guard run and build | Root | Canonical runner summary, JSX exit 0, production build exit 0 on final product revision |
| Browser proof before release | Root + browser test executor | Actual card render at phone/tablet/desktop sizes, four local pending-data previews, controls and no clipped content |
| Hosted checks | Root | Green required GitHub/Vercel checks on exact PR head |
| Coordinated release | Root | Saved database transaction receipt, merged SHA and production deployment identity |
| Live acceptance | Root | Open each of the four live entries, verify new facts and existing identity, provide URLs and screenshots |

The local preview uses real application SSR with a temporary read-only fetch overlay for the reviewed pending database values. Those previews are fixture evidence, not live evidence. No preview hook is shipped in application source.

## Database application and recovery

The forward SQL updates exactly four existing rows in one transaction: Scarecrow, Legends, Tampa crawl and ZooTampa's access warning. Guppyween is code-only. Every row requires the entire backed-up changed-field subset plus both original version timestamps and exactly one affected row. Unexpected values or trigger rewrites abort the batch.

Save the successful forward result's `applied_version` only after commit succeeds. The reverse SQL requires that exact receipt in `wayfind.seasonal_refresh_applied_at`, both matching post-update version timestamps and the expected after values. Missing receipt, later verification or later edits abort recovery instead of overwriting newer work.

The 13 isolated PGlite checks passed twice and were rerun independently: exact forward update, exact restoration, stale before values/timestamps, duplicate IDs, missing/invalid/wrong receipts, later edits/timestamps and repeat-application rejection. Negative cases prove the whole batch rolls back. This fixture does not reproduce production triggers or RLS, so live post-write checks remain required.

## Validation record

Jev judgment tools are not exposed in this session. Source review, deterministic checks and an independent Astra reviewer supply this task's judgment; no Jev verdict is claimed.

- Actual shared-card browser gate passed 4,615 assertions at achieved widths 320, 360, 390, 768, 900, 1440 and 1920px. The deliberate 340px card mutation failed as required.
- Actual application HTTP validation passed 37 checks over eight phone/desktop views. Three event pages returned 200 with the corrected visible schedules and preserved official/ticket links. No uncaught page errors occurred.
- Guppyween was reached through the real homepage Fall poster and API, then opened The Florida Aquarium's existing place sheet with place ID `ChIJCXAq5_DEwogRjTPE2xlsZtE`. It has no database event-detail row; the package preserves its existing venue destination. The conservative test harness blocked its read-only details POST. Live full-place/image verification remains required.
- Guppyween's detailed access wording is in the existing schedule title attribute. The current shared card has no touch-expanded access panel; this package does not introduce one. The public date/hours and Entry rules marker remain visible.
- Local auxiliary inventory/photo reads were unavailable or degraded. Those limitations are recorded; the previews do not claim live photo or nearby-service verification.
- New refresh guard passed 39 runtime assertions and its stale-4pm negative control. The isolated database fixture passed 13 positive/negative controls independently.
- Canonical `node scripts/run-guards.mjs` completed with exit 0: 963/963 manifest guards plus one credentialed rerun, in 715.8 seconds. Product and test revision: `63513e5dd6dc2b747f80ffa82c8dddeb8f4a7857`; the final package update changes this audit record only.
- The canonical run actually measured cards at all seven widths (4,614 assertions); the standalone required-browser invocation added its availability assertion (4,615). The photo-credit hydration check passed all 80 assertions in the complete run.
- Three optional external-data probes explicitly skipped their live assertions: OG bodies without `OG_BASE`, live deal art without Supabase credentials, and live operational/excluded Fall registry checks without Supabase credentials. No manifest command was omitted.
- `npx next build`, `node scripts/check-bundle.mjs` and `npm run check:jsx` all returned exit 0 on that product/test revision. The build generated 840/840 static pages with scoped placeholder configuration. The homepage bundle is 494.5KB gzipped against a 498KB budget (3.5KB headroom).

Local environment repairs installed the official matching Chromium headless shell and the deployed Inter plus standard text fonts without changing product code or guard assertions. The first full-run attempt stopped at a full-Chrome socket restriction. The first card-layout run produced 19 failures also reproduced byte-for-byte on unchanged main before the missing runtime fonts were corrected. Neither failed attempt is counted as a pass.

A full-run photo-credit assertion then observed an intermediate hydration commit. Independent current/main runs passed; an in-memory React Profiler captured photo+credit, then fallback+credit, then fallback without credit one millisecond later. The guard now waits for the complete fallback-and-credit state while retaining both original assertions and the existing bounded polling. A persistent-caption mutation still fails the original caption assertion. No photo component was changed. The unified-feed hash assertion also now requires the newly included shared visit facts.

Two earlier local build attempts were killed by shared-host memory exhaustion and are not counted as passes. The accepted build ran separately after the competing workload ended, with a 3GB Node heap limit and two static-generation workers; no product source, assertions or build checks were disabled.

Hosted checks on the exact pushed head, the guarded database receipt, merged/deployed revision, and live screenshots remain release gates. The PR and final delivery record carry those later receipts; this audit records the package's pre-release evidence.

## Hosted CI time allowance

PR #1912 run `39868104588` passed its dependency audit, Chromium installation, required card/map browser gates, and all 963 guards plus the credentialed rerun (504.9 seconds). Its production build started at 23:13:09 UTC and was canceled at 23:13:30 when the job exceeded its 20-minute maximum. The public Actions summary explicitly reports that maximum-time error; no guard failed. Bundle verification did not run, so that attempt is not a complete CI pass.

The job allowance is now 30 minutes to accommodate cold browser setup, the complete suite, build and bundle verification. All steps, assertions and failure behavior are unchanged. Independent Astra review accepted that bounded adjustment. Current main, including the Next.js patch and the unrelated `8b238011` applied-receipt record, is integrated without changes to the four-entry scope. The final head must complete every hosted gate before database application and release.

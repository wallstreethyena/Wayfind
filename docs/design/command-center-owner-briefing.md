# Command Center owner briefing

The owner needs to understand Wayfind's condition and next actions without interpreting a wall of charts. The former mobile header used multiple rows for nine anchors and seven date buttons, leaving little room for the data.

## Design

- Open with a plain-English owner briefing: yesterday's complete Eastern Time business results, current health checks, available positive results, and three distinct next actions.
- Organize the existing details into Today & business, Visitors, Places & tickets, Reliability, and Details. Existing section hashes select the correct group.
- Keep the dark Wayfind palette with orange accents, clearer typography, room between sections, and compact navigation. Use a date selector on mobile and maintain accessible chart/table controls.
- Preserve every existing dashboard section and its source definitions. Selecting a group mounts its panels rather than fetching all detailed sections at once.

## Report contract

The dashboard and existing daily cron share one collector and formatter. Unknown values are not zero, configuration is not proof of uptime, devices are not unique people, and partner clicks are not bookings or earnings. Business metrics cover yesterday; present health checks are labeled separately. Partner reporting uses the provider's calendar-date semantics.

The existing schedule remains `0 11 * * *` UTC: 7 AM Eastern during daylight saving time, 6 AM Eastern during standard time. The recipient and sender use the existing `DIGEST_EMAIL` and `WF_ALERT_FROM` configuration. No new paid model or data provider is required.

Email success requires a provider-confirmed message ID. Missing configuration, provider failures, timeouts, and date-key conflicts remain visible. Retrying a daily report must not silently create another email. Calendar reminders and the existing market warm-up remain part of the daily job.

## Verification and release

Behavioral tests cover request cancellation, out-of-order responses, unmount isolation, timeouts, malformed responses, and the report's evidence and delivery rules. Existing owner authorization and source-integrity guards remain in place.

The local browser preview is blocked by this session's browser URL policy. Before production release, inspect the hosted preview at 320px, 390px, and desktop widths; verify all five groups, date filters, hash links, chart/table controls, tooltip access, loading/errors, and the owner-only boundary. Verify email receipt and the deployed commit after release. A local build or provider acceptance does not prove final inbox delivery.

### Local verification, September 9, 2026

- JSX validation and both new behavioral tests passed. The request test first reproduced an unmount race, then passed after the lifecycle fix.
- The full runner passed its first 551 guards, then correctly rejected an unrecognized test harness. The request test now runs its real hook assertions in an isolated worker. The repaired honesty check passed.
- After rebasing onto `7374df3a`, all 33 remaining manifest commands, the changed upstream Atlas test, and the credentialed CTA rerun passed. This was a continuation of the failed full run, not a second uninterrupted full run. Browser and live-credential skips remain skips.
- The regenerated registry passed parity checks with 590 entries and no disconnected critical guards. The rebase preserved the incoming affiliate-counter repair.
- No production configuration, database, deployment, or email delivery was changed during this implementation.
- The first full Next build exited 0. The final rebased build emitted its complete route table and build artifacts; its process-exit retrieval was unavailable after the tool session reported cancelled network approval. The final artifact's bundle check exited 0 at 494.6 KB gzip against the unchanged 498 KB ceiling. Hosted CI must confirm a clean final exit before release.

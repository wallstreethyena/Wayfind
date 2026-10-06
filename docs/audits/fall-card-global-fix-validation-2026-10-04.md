# Global Fall card correction: validation status

Prepared against consolidation PR #1636 head `160cacb240e4db42a3dd75283d3be3f0c02a26d1`, main base `f88356590728bb218f0a9d8498d5584eb113dfae`. This file records a prepared candidate, not a merged or deployed result. Source evidence and the original six-problem acceptance matrix are in `fall-card-visit-facts-2026-10-04.md`.

## Passed on the final runtime source

- `npm run check:jsx`: exit 0.
- `npx next build`: exit 0 with the repository's documented placeholder public configuration. Build warnings about unavailable production inventory/integrations are expected with that configuration; this does not verify production data.
- `node scripts/check-bundle.mjs`: exit 0. Total 462.2 KB gzip against the unchanged 498 KB budget, 35.8 KB headroom.
- `node scripts/check-guard-registry.mjs`: exit 0; 820 expectation entries, 96 critical entries, all expected wiring intact. New tests registered and the rich-card fixture increases the existing geometry guard's assertion expectation.
- `node scripts/test-fall-visit-facts.mjs`: 52 executed assertions, plus a child process that restores the always-open defect and exits 1.
- `node scripts/test-fall-card-integration.mjs`: 16 actual component/error-handler/state, retained-payload, database-projection and schema consistency assertions.
- `node scripts/test-place-recommendation-order.mjs`: real rendered score/card/map ordering; stable ties; original proximity ties; unsorted mutation exits 1.
- Relevant existing checks: Fall intent 197 assertions; venue identity 127; date/order 101; Augtober 92; house-card 101; awards 690; photo credit 510; paging 50; curated events 23; Fall cache 9 runtime assertions. Additional focused event/stay/outing/score checks passed during the bounded ordering implementation.
- Independent read-only review replayed 19 semantic assertions and 13 actual JSX/error-handler/state assertions after the reported counterexamples were repaired.
- `git diff --check`: exit 0.

## Canonical gate remains blocked

`node scripts/run-guards.mjs` passed its first 350 commands and stopped at command 351 of 816, `check-doc-ownership.mjs`, because this existing consolidation candidate changes owner-governed files and lacks an exact-head owner approval verified by GitHub Actions. This is not a full-suite pass. No approval variables, thresholds or gate bypasses were introduced.

A separate diagnostic-only attempt for the remaining 465 commands completed positions 352–355 successfully, then its tool execution was rejected by the permission reviewer for a possible GitHub network/data-sharing request. The batch was not restarted or routed around the rejection. The remaining commands and existing stubbed-credential pass are not claimed completed by that attempt. Read-only inspection found that `check-locks.mjs` uses local git and LOCKS.md reads; this is a `blob:none` partial clone whose public GitHub origin may lazily provide missing objects, but the rejection did not expose the exact wire payload. Approval remains a separate issue.

## Browser and deployment acceptance remains open

Native Chromium launch is blocked by the execution environment's socket permission, including one supported escalation retry. No rendered phone dimensions or native dialog interaction pass is claimed. The existing required browser geometry guard includes a rich Fall card with price, parking, rules, both links and photo credit, with unchanged sizing/containment thresholds. Preview/CI must verify its actual 390–395px layout and dialog Close/Escape/focus return. The existing exact-head owner, database and MapKit release gates remain separate and unchanged.

Exact rights-proved 2026 event photography is unavailable for Sweetfields, St. Pete Pier pumpkin patch and HHN35. Existing venue photos are now explicitly described as venue context. No paid service or image purchase was made. A real-event-photo replacement remains open until its subject and reuse rights are proved.

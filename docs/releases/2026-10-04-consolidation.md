# October 4, 2026 consolidation

This release consolidates the 35 open pull requests captured in the adjacent source receipt. Older branches are compared against current main by behavior and content, not replayed wholesale. Main was rechecked and the replacement rebased on `f88356590728bb218f0a9d8498d5584eb113dfae` after upstream #1635 landed.

## Source accounting

| Source PR | Treatment in the replacement |
| --- | --- |
| #1632 | Rebuild the eleven-source handoff on current main; preserve later breakfast-award and editorial changes |
| #1630 | Preserve Tampa Bay calendar import tooling and reviewed event source files; publishing rows remains a separate operation |
| #1627 | Partner-click reporting and optional confirmed-test-device exclusion support; production migration and readback required |
| #1624 | Short landing-card cue and link to full editorial |
| #1599 | Exact reviewed Siesta duplicate-retirement migration; apply, read back both rows, and record receipt before merge |
| #1597 | Manual production guide-photo verifier retained |
| #1592 | Past-guide archive and lifecycle handling, with current licensed-photo links |
| #1588 | Reviewed per-guard expectation rows; strengthened with full-entry and metadata digests so old snapshot protection is retained |
| #1571 | Owner editorial review, guarded placeholder replacement, and descriptive-only local-press handling |
| #1570 | Superseded by main #1600 and #1604; keep current Command Center coupon-audit alerts and expiry boundaries |
| #1561 | Shared-clone governance clarification; exact-head owner approval required |
| #1558 | Preserve photo-credit purge SQL and receipt; already applied, never replay |
| #1533 | Place-photo contributions, preserving explicit signed-in identity in the write and pending moderation |
| #1531 | Missing-photo-source regression protection; existing main migration differs only by a blank line, not SQL behavior |
| #1524 | Superseded by main #1525 and subsequent Fall changes; preserve current verified images |
| #1523 | Superseded by main #1525 and subsequent shared-card changes; preserve current geometry, gestures and hotels |
| #1519 | Superseded by main #1525; preserve its stronger complete-guide image controls |
| #1506 | Weekly seasonal discovery workflow; add report validation so missing credentials or incomplete output cannot report success |
| #1496 | Promote the shipped photo-led share-card rule and enforce documentation/code agreement; owner approval required |
| #1488 | Remove duplicate Dinner + Entertainment rail and put each Night Out item in its canonical rail |
| #1385 | Keep shipped native trend architecture; port bounded streaming, origin and privacy hardening only |
| #1383 | Keep newer verified Fall inventory; add serve-time seasonal-evidence expiry rather than restore stale September data |
| #1319 | Superseded by main #1280; retain newer cached-image and visible-image protections |
| #1285 | Port remaining exact-SKU, per-attempt grant and budget-completion protections; retain current operator caps and approved promotion limits |
| #1274 | Preserve current creator presentation; port cached-cover reconciliation and event-page recovery only |
| #1272 | Empty-parent inventory merge already shipped in #1297; preserve residual provider-state diagnostics without broadening product eligibility |
| #1268 | Adapt complete owned 9.2+ viewport inventory and Apple flat-map behavior while preserving current controls and score/disclosure rules |
| #1267 | Adapt Family Day taxonomy/radius expansion using the current shared card standard |
| #1263 | Poster response reuse, selected-module preparation, visible timing and complete-only Fall cache admission; keep stronger current server pool concurrency |
| #1250 | Cross-clock monitor and token-preflight tooling; managed-cron migration is stored for separate verified application |
| #1249 | Classified, cancellable bounded rail recovery; preserve newer independent sports, event and cached-tour fallback paths |
| #1248 | Bound beach headers and JSON reads; an unavailable source is distinct from a healthy empty list |
| #1233 | Main already fixes the original query plan; port retry/SQLSTATE diagnostics on the current free-candidate view only |
| #1209 | Branch-owned lane coordination locks with runtime controls; `LOCKS.md` remains owner-gated |
| #1145 | Add calculation receipts and sourced score explanations using current arithmetic; expired pilot research remains unavailable |

## Additional requested guide discovery

Local Guide cards use reviewed, attributed images. Contextual inserts use covered place identity, keep organic place order intact, and stay out of thin or unrelated rails. The standard place rails and ten specialized menu composers support matched guide discovery. Family Day remains excluded because its visible inventory is filtered independently inside each rail; event-only and tour-only matches are also excluded. Hosted visual acceptance remains required.

## Release gates

- Required GitHub guard, production build, bundle and rendered-card/map checks must pass on the final revision.
- Owner-only documents and workflows require the owner's authenticated approval of the exact new head. Old approvals do not transfer.
- The Siesta and partner-reporting migrations require saved recovery snapshots, canonical application and readback. The already-applied photo purge must not be replayed.
- Local placeholder tests are not live MapKit, production-data or hosted-browser verification.
- Remote source refs and current main must be rechecked immediately before merge or cleanup. Unresolved unique branches remain preserved.
- Calendar import rows are not silently published by a source merge. The #1250 managed-cron migration is absent from the live ledger even though current jobs already match its contract; canonical application and its receipt are an additional pre-merge gate.

## Branch inventory

All 1,033 remote branches were matched to exact local remote refs without omissions or SHA mismatches. Of the branches without an open PR, 857 have conservative preservation evidence in main history and 140 remain preserved for unresolved unique differences. These counts describe the audit snapshot, not completed deletions. Protected main and all 35 source-PR branches are excluded from the initial cleanup candidate set.

Private unpublished worktrees could not be inspected from this cloud checkout. They are not represented by a claim that every local worktree was closed.

## Verification receipt before publication

The isolated production build at local candidate `d94dfc90b957f9d93bd1a2c8d6559568a4d4ac72` completed all 816 routes. The homepage bundle was 458.0 KB gzipped against the unchanged 498 KB limit. Subsequent changes were confined to tests, the source-inspection audit, reviewed expectation rows and documentation; application, library, assets, dependencies and build configuration remain byte-identical to that build.

The canonical local suite stopped on a stale job-watch fixture after 277 successful commands. A separately recorded sequential diagnostic sweep executed the remaining 535 commands: 526 returned zero. Six drifted test fixtures and the guide SEO metadata receipt were repaired and rerun against the union. Repairs exercise the new actual behavior and preserve original negative controls; intentional regressions still fail. This diagnostic plus targeted evidence is not an uninterrupted canonical pass.

Known non-green acceptance gates remain visible: exact-head owner approval, the credentialed Fall inventory checks, and Chromium/MapKit rendering unavailable in this local executor. The Fall guard passes its 52 local assertions with live checks explicitly skipped when credentials are absent. Required GitHub and hosted preview acceptance must still pass. The dependency audit reported zero moderate, high or critical findings and one inherited low finding. No dependency versions changed.

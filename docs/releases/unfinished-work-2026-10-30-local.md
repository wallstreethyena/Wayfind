# Local Wayfind unfinished-work audit — 2026-10-30

Baseline: `origin/main` = `8f2d4fe8eb0cdf591da20dffd37a5f52df9f4322` during read-only census. No original checkout, branch, env file, or production data changed. The dirty primary checkout was only inspected. Scope is recent work, not an assertion that every historical branch was individually reviewed. Primary checkout has 64 tracked modifications and 158 untracked status entries on an unrelated old branch; these were preserved, not bulk-imported. `primary-dirty-paths.txt` inventories those paths without secret values. Their ownership and current relevance require item-specific evidence before inclusion.

## Recovery of supplied commit leads

`8539b97` and `a394d48` were absent from 11 independent Git object stores discovered across 353 repository/worktree paths under `/Users/gabrielpereira/Projects`, `/Users/gabrielpereira/Documents/Codex`, and `/Users/gabrielpereira/mnt` (maximum discovery depth 5; skipped node_modules, .next and internal cache directories). Relevant scoped Markdown/text/patch/JSON searches found no source patch outside this audit's own checkpoint. Neither commit can be recovered from the known local paths. This is absence of local objects, not a denied action. No runtime session credentials or secret/env files were read. Evidence: `commit-recovery.json`.

## Recoverable unfinished work

| Source | Present evidence | Recommendation / remaining acceptance |
|---|---|---|
| `wf-dracula-halloween-20261027`, `c0ac88d63a06e6ee56936aabb590b37301f6043f` | Clean local commit; 10 files; no matching main patch. Task `Add Dracula’s Legacy to Halloween` ends prepared, no push. Changes put Tampa location first and attach Cindy Selects reel/avatar. Source patch exists in that task outputs. | Include reviewable delta in authorized consolidation, preserving newer creator/seasonal data. Original tests/build are historical, final union still needs checks. |
| `wf-map-pro-20261025`, `aded8a0818c80e7240f0bd847bdc4241d51b3741` | Clean local commit; three files; no matching main patch. Exported `map-pro-explorer.patch`. | Recovered and tested in isolated `map-pro-recovery` clone; map-pro-recovered.patch delivered. Original same-ID marker replacement is broken: changing coordinates produces two markers and destroy leaves one. New regression reproduces failure and repaired source passes. Score-pill subfeature conflicts with current no-score teardrop rule pending later owner evidence; preserve default rings. UI/browser acceptance remains separate from Apple server credential gap. |
| `wf-cafe-badge`, `954797d462ee7b6512fd4336e4dfe999ea486185` | Clean local commit; `best-cafes-2026` absent from main awards registry. Six exact winning locations plus sourced Atlas editorial. | Parent reports #1861 is already inside #1954 recovery; avoid duplicate integration. Raw local source available if needed. |
| `wf-buy-button` uncommitted work on `7266f2addb083ec2dc7fd4345d43328af8804e48` | Nine changed files, 126 insertions/68 deletions. Promotes verified partner pill to visible Buy CTA, adds common labels and partner rung to home PlaceCard. Exported `uncommitted-card-buy-button.patch`. | Recovered against current main with three-way application preserving newer movie-voucher copy. Invalid old calibration-text edit repaired without lowering thresholds; shared card browser guard passes 4,614 assertions across seven widths. buy-button-recovered.patch delivered. |
| `wf-astra-global-photos-20261022` uncommitted `scripts/check-experiences-link-health.mjs` | Deterministic watchdog-first fixture and duplicate-pulse mutation proof, 58 insertions/10 deletions vs its old HEAD. | Independent test improvement, but raw file also lacks newer main `pastDeadline`/`inTime` cases. Preserve current cases if adopting; do not replace wholesale. Export if requested. |
| `wf-sitemap-perf` untracked `likeprobe/` | Debug artifact only; branch's sitemap changes already landed #1946. | Preserve local artifact; no product integration requested. |

## Recent work already represented on main

Patch identity via `git cherry origin/main <head>` confirms exact equivalents for: group-plan clock #2011, global 404 #1937, affiliate event links #1902, Chromium CI #1906, dependency patches #1936, Directions single-open #1944, watchdog failure naming #1925, Group Vote everywhere #1935, Moves2/3 coverage #1864, shared-trip usability #1973, global likes #1957, like-everywhere commerce mirror #1967, phase1 revenue/trust #1855, place address #1887, rail/footer verifier #1968, SEO breadcrumbs #1938, Florida sitemap #1888, affiliate watchdog #1926, and Wave2 detail-sheet buttons #1927.

Other source branches have squash/rebase differences and must not be declared unfinished just from ancestry: Boo out-of-coverage (#2014), Halloween all affiliates (#2031), guide image repair (#1971), hosted commerce exit (#1976), group setup (#1863), footer (#1905), shared-trip save (#1959), shareable search (#1947), sitemap performance (#1946), Wave2 picks (#1908), and card tour labels (#1889). Parent's remote ledger should supply authoritative PR status.

`Fix the current issue` local Codex task has a later completed turn confirming #1997 pushed/merged/deployed, 1,004 guards and targeted live checks. Its earlier prepared/pending approval note is stale. The remaining limit is direct testing inside Facebook's app, not an unpublished patch.

## Evidence files

- `local-worktree-inventory.json`: every existing primary-repo worktree with HEAD dated October 18 or later, clean/dirty status and ancestry.
- `recent-branch-comparison.json`: patch-equivalence and matching main commit subjects for recent non-ancestor worktrees.
- `commit-recovery.json`: object-store recovery census and absent commit results.
- `map-pro-explorer.patch`: original unpublished map change.
- `map-pro-stale-annotation-repro.mjs` and `.log`: original bug reproduction (Node exits 1).
- `map-pro-red.log`: new regression fails original source with 2 markers instead of 1.
- `map-pro-focused-checks.json`: local check outcomes; browser sandbox launch failures explicitly recorded.
- `uncommitted-card-buy-button.patch`: preserved original dirty delta only, not validated integration.

## Recovery updates

Map lane completed as `map-pro-recovered.patch`; report `map-pro-recovery.md`. Native annotation regression repaired and tested red/green. Shared teardrops and existing default rings preserved; original score-pill/default-hidden-ring subfeatures held because no later exact owner override of current map rules was supplied. Actual preview/drawer phone/tablet/desktop fixture geometry passed with local Chromium after authorized sandbox escalation.

Buy-button lane completed as `buy-button-recovered.patch`; report `buy-button-recovery.md`. Three-way application to main preserves newer movie-voucher copy. Fixed the unfinished work's inconsistent font-calibration phrase; 4,614 real Chromium card assertions and existing mutation control passed. Recommendation is include, with final union checks by parent. Earlier hold recommendation above described the unreviewed raw patch and is superseded by this recovery.

Dracula integration is owned by parent/trust agent. An isolated attempted `dracula-recovery` clone remains conflicted and unused; do not apply it. Parent already integrated original creator fields/tests and is preserving current priority behavior.

Experience watchdog fixture saved unchanged as `uncommitted-experience-watchdog-test.patch`. It is an additional test-only improvement, not included in map or buy patches; retain current main's newer deadline positive/negative cases if integrating. No evidence here that the production route needs another change.

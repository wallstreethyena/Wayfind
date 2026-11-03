# Lane: claude-exe

Only this lane writes to this file. See docs/lanes/README.md.

## Current task
Data-integrity handoff, part 2 (owner brief 2026-11-03 evening). Single production writer for wf_inventory locality/county/metro rows named below.
- Migration reconciliation: #2122 (Cowork, 14 pins) + #2165 (3 pins for the 19:33Z event-truth rows) + #2167 (introspection read paged; it was truncated at 1,000 of 2,349 rows). Combined branch passed the real canary: run 41718295731, 6/6 green.
- Canary checkout: #2164 (owner-only file, needs /owner-approve). Checkouts of the ~640 MB tree ran past job caps from ~17:10Z; sparse checkout without public/ ran 18-42 s (run 41716413202).
- #2162 pending-apply: Census county for the 82 backfilled rows, Holmes Beach beach locality/county, Sir Henry's metro key.

Worktree: `../wf-claude-data`, branch namespace `lane/claude-exe/*`.

## Blocked on
- #2164: owner `/owner-approve <head>` (.github/workflows/canary.yml).
- #2122: its owner (Cowork lane) to merge; this lane does not touch it.

## Do not interrupt
no

## Recently landed
- #2129 canary repair, applied 2026-11-03T12:32Z (ledger 20261103123231): Holmes Beach town row suppressed as a non-venue, two County suffixes stripped.
- #2128 Census-gated locality backfill, applied 2026-11-03T12:47Z (ledger 20261103124728): 82 of 118 written; 10 conflicting + 26 unsupported not written.

## Follow-ups (each with owner and next action)
- [x] 82 backfilled rows had no county: #2162 writes the Census county (apply after merge, then receipt).
- [x] Holmes Beach beach ChIJaWeoBbURw4gRDYfwKuwOVW0 locality/county empty: #2162 (Census: Holmes Beach / Manatee).
- [x] Sir Henry's ChIJeZM_F1A23YgRFICuRhA_pIo metro 'tampa-bay' (no reader knows it): #2162 sets 'tampa'.
- [ ] Scream-A-Geddon ChIJ7zRUJ9CowogRM70pcoqrdUM locality 'Dade City' is a mailing city (Census: no place, Pasco). Owner decision, same policy as the 10 below.
- [ ] 10 Census-conflicting rows: owner decision. Writing the Census place would make lib/venueAnchor.js and lib/applePlaceMatch.js reject events and Apple matches listed under the mailing city (exact-string cityAgrees; NULL is neutral). Recommended: keep NULL; locality stays "Census place, written only where it agrees with the listed city".
- [ ] Place page city (#2069, other session): reviewed 2026-11-03 (comment on #2069). Two defects: a lone street segment outranks inventory locality ("in Gulf Drive"), and rung 1 is not state-filtered ("Gulf Drive, Florida" -> "Florida"). Branch conflicts with main in 4 files; Vercel red. Overlaps #2067.
- [ ] #2127 and #2138 edit the already-applied 20261029223000 migration; merging either would make reconciliation red. Flagged on #2122; owners to close.
- Canary photo NOTE counts photo_ref only and treats 1-row metro keys as metros; 6 wfadd_* rows (dallas-fort-worth-tx, austin-tx, western-massachusetts-ma) are genuinely imageless. Sir Henry's stray 'tampa-bay' key leaves with #2162.

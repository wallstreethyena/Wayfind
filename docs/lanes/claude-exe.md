# Lane: claude-exe

Only this lane writes to this file. See docs/lanes/README.md.

## Current task
Data-integrity and city-model program (owner-approved 2026-11-03/04). Single production writer for the wf_inventory locality/county/metro/postal_city rows named below.
Stages: prepared = PR open; merged = on main (squash SHA); applied = in the production ledger (version, hash = file); verified = read back from production; deployed = production READY serving the SHA.

| Work | PR | Stage |
|---|---|---|
| Reconciliation reader pages every row, proves completeness, fails closed | #2167 via bundle #2193 | merged 2b1b53aa; verified on production (run 41721410821) |
| Review pins: 3 event_truth_integrity_* rows (2026-11-03 19:33Z) | #2165 via #2193 | merged 2b1b53aa |
| County for 82 rows, Holmes Beach beach, Sir Henry's metro | #2162 via #2193 | merged; applied 20261104022317 (c8b03ea4); verified (counties +83); receipt #2201 merged 865db12f |
| postal_city columns + 11 verified mailing cities | #2170 via #2193 | merged; applied 20261104022425 (96287b80); verified (11 rows); receipt #2201 merged |
| Matching reads postal_city (venueAnchor, Apple) | #2173 via bundle #2194 | merged 43a020ec; deployed (dpl_99Xsw95xnBoABnnZAwzgVFq2KVUK READY) |
| One place-city function (title, share, PostalAddress, headers) | #2179 via #2194 (replaces #2069, #2067) | merged 43a020ec; deployed; live check found two gaps, fixed in #2203 |
| Census locality for the 10 conflicts; Scream-A-Geddon mailing city kept in postal_city | #2174 | merged 3c6b22be; applied 20261104045657 (f311b4ee); verified; receipt #2204 prepared |
| Page city reads wf_inventory on every page; no "X in X" | #2203 | prepared (merge chain running) |
| Santa dock personality (idle quips + gestures) | #2200 | merged a56825b2; deployed (production ca627c87+); verified live phone + desktop |
| Canary checkout skips public/ | #2164 | prepared; owner approval posted per head (authorized 2026-11-04); merge chain retrying |
| CLAUDE.md rule: no connector schema writes without a repo migration | #2175 | prepared; owner-only, needs the owner's own approval |

Worktrees: `../wf-claude-data`, `../wf-claude-city`, `../wf-claude-loc`; branch namespace `lane/claude-exe/*`.

## Blocked on
- #2175: owner `/owner-approve <head>` (CLAUDE.md is owner-only; not covered by the 2026-11-04 authorization).
- #2122 (Cowork lane): its owner merges it; until then the canary's migration check reports its 14 rows.

## Do not interrupt
no

## Recently landed
- #2129 canary repair, applied 2026-11-03T12:32Z (ledger 20261103123231): Holmes Beach town row suppressed as a non-venue, two County suffixes stripped.
- #2128 Census-gated locality backfill, applied 2026-11-03T12:47Z (ledger 20261103124728): 82 of 118 written; 10 conflicting + 26 unsupported not written.

## Follow-ups (owner, next action)
- Canary photo NOTE counts photo_ref only and treats 1-row metro keys as metros; 6 wfadd_* rows (dallas-fort-worth-tx, austin-tx, western-massachusetts-ma) are genuinely imageless. Owner: this lane; next: none required (diagnosis only, no refill, no spend).
- `/christmas` returns 404 (the hub is /christmas-in-florida). Owner: SEO/audit lane; next: decide on a redirect.
- Other rows whose locality is a Census CDP (e.g. Town 'n' Country 44, Palm River-Clair Mel 16) have no postal_city yet; matching stays neutral-safe only where postal_city exists. Owner: this lane; next: a Census-evidenced postal_city backfill, same method as 20261103230000.

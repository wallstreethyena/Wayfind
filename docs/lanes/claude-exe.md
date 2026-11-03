# Lane: claude-exe

Only this lane writes to this file. See docs/lanes/README.md.

## Current task
Data integrity handoff (owner-approved in-session 2026-11-03). Single production writer for these rows:
1. Locality backfill #2075: Census-gate the 118 candidates, apply the eligible rows (`wf_inventory.locality` on the place_ids listed in `docs/audits/20261031000000_wf_inventory_locality_from_owned_events.csv`).
2. Canary `production data integrity` red since 2026-11-01: Holmes Beach duplicate pair, county suffix on Scream-A-Geddon and Sir Henry's Haunted Trail.
3. Four metros with zero photos (dallas-fort-worth-tx, austin-tx, western-massachusetts-ma, tampa-bay): diagnosis first, no refill job.
4. Returned Viator code 298601P1: identity and click-path check, no purchase.

Worktree: `../wf-claude-data`, branch namespace `lane/claude-exe/*`.

## Blocked on
_(nothing)_

## Do not interrupt
no

## Recently landed
- #2129 canary repair, applied 2026-11-03T12:32Z (ledger 20261103123231): Holmes Beach town row suppressed as a non-venue, two County suffixes stripped.
- #2128 Census-gated locality backfill, applied 2026-11-03T12:47Z (ledger 20261103124728): 82 of 118 written; 10 conflicting + 26 unsupported not written.

## Follow-ups (not done, need a decision or another lane)
- Scream-A-Geddon ChIJ7zRUJ9CowogRM70pcoqrdUM: locality 'Dade City' is a mailing city (Census: unincorporated Pasco).
- Sir Henry's ChIJeZM_F1A23YgRFICuRhA_pIo: metro 'tampa-bay' (every other Hillsborough row is 'tampa').
- Holmes Beach beach ChIJaWeoBbURw4gRDYfwKuwOVW0: locality/county empty (Census: Holmes Beach / Manatee); its page title reads "in Gulf Drive" (street as city) until #2069's city ladder lands.
- The 82 backfilled rows have no county (Census county is in the .census.json evidence).
- 10 conflicting backfill candidates (e.g. Gatorland -> Southchase CDP, Children's Planet -> Edgewood): writing the Census place instead of the mailing city is an owner decision.
- Canary photo NOTE counts photo_ref only and treats 1-row metro keys as metros; 6 wfadd_* rows (dallas-fort-worth-tx, austin-tx, western-massachusetts-ma) are genuinely imageless.

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
_(nothing yet)_

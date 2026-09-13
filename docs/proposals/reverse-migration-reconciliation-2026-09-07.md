# Bidirectional migration reconciliation

The canary now checks both repo-to-production and production-to-repo.
Unknown production-only migrations fail. Historical exceptions pin version,
name, SHA-256 of exact ledger statements, reason and reviewer. A missing file,
unapplied migration (including DML), wrong hash or stale exception fails too.
Existing historical aliases retain their live-object probes.

The new service-role-only wf_migration_ledger_hashes RPC returns hashes, never
SQL. Encoding: SHA-256 of UTF-8 PostgreSQL to_json(statements)::text, retaining
statement order, boundaries and whitespace. It leaves the old RPC compatible.
Canonical correspondence uses unique derived names because Supabase assigns
versions at apply time, while existing repo files often use date-only versions.
This is not a claim of canonical SQL byte equivalence. Historical pins do require
exact hash equality. The exception manifest is never executable SQL.

## Historical audit and rollout

The September 7 audit counted 162 ledger entries. Beyond the specifically
reviewed 20260907114404 / wf_schema_objects_full_catalog_fix exception,
129 entries lacked unique canonical file correspondence. This is historical
review debt, not proof of 129 unsafe changes. No bulk snapshot is published
or used as an allowlist. No historical SQL is recreated as a normal migration.

The 129 new review items are now individually recorded in the exception manifest,
with exact hashes and concrete statement purposes. Apply the complete committed
new introspection migration through scripts/apply-migration.mjs, verify live
reconciliation, and merge only after checks pass. The RPC has not been applied
in this work.

## Scheduled popularity evidence, September 7 at 16:23 UTC

Production selected Yelp=0 (bad_key_format), Foursquare=0 (breaker_open),
TripAdvisor=0 (retired), Wikipedia=100. Wikipedia saved 29 results and recorded
71 no-data observations, with zero attempt-write errors. Its ledger grew from
513 to 613; the 100 new observations all had attempt_count=1. The next selector
returned 100 never-attempted rows and zero overlap with that completed batch.
That combines scheduled cron evidence with the next selector, not selector-only
proof. Diagnostic tags and attempt_count remain different measurements.

No throttle occurred, so stopping on Retry-After and excluding throttled or
backoff-skipped candidates remain unproven by this scheduled run. There was no
pre-run exact-ID snapshot in this session, so that comparison is not claimed.
These are timestamped historical findings, not a new current-production audit.

Job-watch's 14:45:50 HTTP 500 and persisted 5 attempted / 0 succeeded / 5 failed
self-pulse were independently verified. Failure visibility is proven; email
configuration remains a separate dependency. Credentials were not changed.

## Release policy

Leave branch protection unchanged. Decide separately whether to require a
stable build/release status after measuring deterministic behavior and preview
infrastructure noise. Do not reopen #1156, #1159 or #1160.

## Recovery and verification

The owner explicitly approved publishing the required hash record and summarized
production findings after automatic disclosure review blocked the original PR.
The prior local checkout was unavailable when approval arrived. This patch was
recovered from the conversation onto current main 1ac925c3, without raw snapshots.
Thirteen actual CLI exit-code controls pass, including all five owner-requested
cases. Manifest, hermeticity and canonical registry checks pass. The registry
was regenerated from the current tree. Fresh full-suite CI must validate this
recovered patch; prior-session build results are not claimed for this tree.

The full local guard run passed 572/572 guards plus the credentialed fixture
rerun. JSX validation and the bundle ratchet also passed. Final hosted CI
will validate the published commit, including the production build.

## Individual historical review record, September 8, 2026

The owner approved publishing the production ledger hashes after review. I queried
`supabase_migrations.schema_migrations` in project `gbhtoehdxkzjsmmkisgu`
(read only) and fetched all 162 rows. Each row contains one statement-array
element. I inspected each complete statement body privately and recorded its
specific schema or data purpose in `scripts/migration-historical-exceptions.json`.
The manifest publishes no SQL snapshot and makes no claim that a historical body
is byte-equivalent to a current repository file.

The prior audit identified 129 new review items: 127 additional historical rows
with names absent from the current migration directory plus both rows in the
`wf_lunch_dish_images` duplicate-name conflict. The manifest also retains the
previously reviewed `wf_schema_objects_full_catalog_fix` row, for 130 exact
production-row pins total. Both duplicate rows are pinned separately and carry
the explicit canonical-file mapping; their hashes remain distinct.

Review coverage by production apply date:

| Apply date | Rows pinned |
| --- | ---: |
| 2026-07-18 | 10 |
| 2026-07-21 | 10 |
| 2026-07-22 | 25 |
| 2026-07-23 | 20 |
| 2026-07-27–30 | 16 |
| 2026-08-03–14 | 17 |
| 2026-08-19–28 | 24 |
| 2026-09-02–07 | 8 |
| **Total** | **130** |

The forward audit remains separate from these historical pins. The two tracked
historical artifacts that describe repeatable maintenance or existing-state
baseline work are not treated as applied migration receipts. The new
`wf_migration_ledger_hashes` introspection migration is intentionally the only
expected forward-unapplied migration until an operator applies it through the
canonical migration path. No historical SQL is recreated or replayed.


Two non-migration SQL artifacts were moved without changing their bytes:

- `supabase/backfills/cuisine_backfill.sql` is regenerated from the current
  cuisine classifier; it is repeatable maintenance, not an immutable applied
  migration. Its generation/parity guard still runs.
- `supabase/baselines/wf_promote_existing_metros.sql` documents the existing
  metro configuration for the offline fallback; it is not an application receipt.
  Its SQL/JavaScript parity guard still runs.

Neither artifact was replayed or marked applied to manufacture a passing result.
Against the captured 162-row production ledger and 1,669 catalog objects, reverse
reconciliation has zero errors; 43 of 44 canonical files reconcile forward. The
remaining file is the new, unapplied introspection RPC described above.

The canonical apply command was attempted on September 8 and refused before
execution because this workspace lacks `SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY`. No database write occurred. The connected
read-only ledger audit is not a substitute for the required apply-and-reconcile
operation. Production rollout remains pending that authenticated operation.

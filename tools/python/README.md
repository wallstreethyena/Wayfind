# Wayfind Python audit and scout tools

Read-only batch analysis of inventory/editorial coverage, recorded provider usage,
job outcomes, and possible duplicate places. The web application continues to use
its existing JavaScript code. No changes to ranking, publication, refresh, shuffle,
spend caps, or database records are made by this package.

The same locked package also includes `wayfind-scout`, a separate private
dry-run tool for approved official JSON-LD, ICS, RSS and Atom sources. It blocks
Yelp/Tripadvisor pages, makes no paid-provider calls, creates candidates rather
than published records, and leaves the application untouched. See
[`docs/WAYFIND_FREE_SOURCE_SCOUT.md`](../../docs/WAYFIND_FREE_SOURCE_SCOUT.md).

## Start here

Install Python 3.12 and uv (the tested uv version is 0.11.33), then from this folder:

```bash
uv sync --locked --all-extras
uv run --locked pytest -q
uv run --locked wayfind-audit report --input examples/snapshot.json --out reports/demo
```

The demo is synthetic and says so in both outputs. Open `reports/demo/report.md`
for the readable report or `report.json` for the complete machine-readable result.
Choose a new output directory for each run; existing evidence is never overwritten.

Runtime installation without development tools:

```bash
uv sync --locked --no-dev
uv run --locked --no-dev wayfind-audit report --input private/snapshot.json --out reports/my-run
```

DuckDB is the only direct core dependency. It performs grouped analysis and spatial
candidate joins in memory. No pandas, ML model, paid API, or always-on server is
needed. The optional `live` extra adds psycopg for database collection; `dev` adds
pytest and Ruff. `uv.lock` fixes resolved versions and hashes. Commit the lockfile,
not `.venv`. A version file selects Python 3.12; patch releases may differ by host.

## Live collection

Use a database connection string supplied through the environment variable
`WAYFIND_AUDIT_DATABASE_URL`. Prefer a dedicated role with SELECT permission only
on `public.wf_inventory`, `public.wf_editorial`, `public.wf_spend_ledger`, and
`public.wf_job_pulse`. The role must be able to see the complete intended inventory;
RLS-filtered visibility is not a statewide census. Have the database owner confirm
this before scheduling. Do not create a new public policy or expose privileged
credentials in the frontend. This change does not create roles or modify grants.

Supply the secret through your normal secure credential manager, not a command
line, tracked file, or pasted report. The collector never loads `.env` files.

```bash
uv sync --locked --no-dev --extra live
uv run --locked --no-dev wayfind-audit collect --days 7 --out private/snapshot.json
uv run --locked --no-dev wayfind-audit report --input private/snapshot.json --out reports/live-run
```

The collector uses TLS, a 10-second connection timeout, a 30-second statement
limit, and one REPEATABLE READ / READ ONLY transaction. It consumes all batches
until exhaustion; the default 100,000-row ceiling fails rather than silently
truncating. No stored procedure, external provider or write operation is invoked.
The seven-day job window is bounded with an exclusive upper timestamp.
Snapshot schema version 2 adds the pulse note required for domain interpretation;
older snapshots fail the column/version contract instead of producing guessed outcomes.

If a direct connection is unavailable, `sql/snapshot.sql` is a fixed read-only
single-statement export for the existing authenticated database query tool or SQL
editor. Save the JSON value in its `snapshot` column, without any tool wrapper, to
`private/snapshot.json`, then run the same report command. This route was used for
the first complete production-data validation. Do not mistake a truncated UI
preview for the full export. The importer checks row counts and primary keys.

No pagination guesswork: the direct collector consumes every DB row; the SQL
export returns all datasets and counts within one statement snapshot. Externally
assembled exports must declare `multi_request` consistency and their exact scope.
An empty complete dataset is allowed; an absent or partial dataset is an error.

## What the results mean

- **Coverage:** counts inventory rows by stored metro/category, classifying them
  as operational and unflagged, flagged, closed, or unknown. Missing flags stay
  unknown. These are not live rail eligibility predicates or recommendations to
  publish more of a category blindly. Other editorial sources (owner Atlas and
  legacy JS copy) are intentionally not claimed absent when `wf_editorial` is missing.
- **Editorial:** distinguishes missing rows, unverified/flagged content,
  verified-but-thin content, and verified content meeting the diagnostic. The
  diagnostic checks 20 hook characters, 120 why-here characters and at least one
  sourced fact. These match the current publisher's broad requirements, but SQL
  trimming/character length differs at rare Unicode boundaries. The audit is not
  the authoritative publishing gate and never changes a verification flag.
- **Usage:** reports recorded SKU grants and stored caps by month. Counters can
  include seeded usage and are not invoices. Stored caps may differ from the
  effective current spend policy. No price table or dollar savings is invented.
- **Jobs:** preserves each job's raw attempted/succeeded/failed pulse counters,
  idle runs, zero pulse-succeeded runs, and inconsistent counters. Those counters have
  producer-specific meanings and are not a shared success metric. For
  `photo-repair`, `photo-monitor`, and `place-photos`, the report also parses the
  producer's note into strict domain outcomes. Classification remains separate
  from recovery; a monitor pulse failure can mean a newly emitted alert; valid
  Commons rejections remain separate from worker errors. Missing, malformed, or
  counter-inconsistent notes produce `unknown` fields rather than zero. Full
  snapshot-window and latest-24-hour sections are labeled separately, and bound
  work budgets appear as `PARTIAL`. Place-photo worklist pagination that reports
  `PARTIAL` or `UNAVAILABLE` remains distinct from an ordinary observed worklist;
  unrecognized completion text stays unknown.
- **Duplicates:** compares records in the same known category within 150 meters
  using normalized names with symmetric similarity >= 0.92. Earth-centered
  neighboring cells handle grid edges, poles, and the date line. Candidates are
  review-only; false positives include adjacent shops, renamed listings and
  separate entrances. Different-category duplicates and records missing usable
  coordinates are outside scope. The comparison ceiling fails loudly.

Each JSON report includes input counts, observation window, snapshot consistency,
input SHA-256, tool version, all candidate IDs, and limitations. Job notes are
required snapshot evidence but are not copied into reports; only validated domain
fields are emitted. Reports exclude source names, coordinates, raw editorial text
and credentials. Unknown costs, rates, and domain totals are JSON null, not zero.
Coverage cells and IDs are escaped in Markdown.

## Scheduled workflow

`.github/workflows/python-audit.yml` contains:

1. Automatic Python lint, formatting, tests and synthetic CLI smoke checks on PRs
   and main pushes that touch this package/workflow.
2. A manual live report and a daily schedule at 13:20 UTC. The scheduled live job
   is disabled until repository variable `WAYFIND_PYTHON_AUDIT_ENABLED` is `true`.
3. The live job requires repository secret `WAYFIND_AUDIT_DATABASE_URL`. A manual
   run without it fails explicitly. Scheduled skips mean disabled, not healthy.
4. Only reports are uploaded, with seven-day artifact retention. The raw snapshot
   is deleted at the end, even on failure. Job time is limited to ten minutes.

Activation order: review/merge source; configure the SELECT-only secret; manually
run and inspect a live report; then enable the variable. Runtime minutes and
ordinary database reads can have infrastructure cost; no paid data acquisition is
performed. Disable the variable to stop recurring reads. This task does not enable
it or mint database credentials automatically.

## Retention and privacy

`private/` and `reports/` are gitignored. Do not commit or upload raw snapshots.
Names and coordinates in local snapshots retain their source-specific retention
requirements; exporting does not extend them. Delete raw snapshots promptly after
review and before their source expiry. Shared reports contain stable IDs and
aggregates only. Credentials never appear in handled error messages.

## Verification and maintenance

```bash
uv sync --locked --all-extras
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked pytest -q
uv build
```

Tests include incomplete exports, duplicate IDs, wrong column schemas, invalid
coordinates, unknown caps, zero denominators, inconsistent counters, idle jobs,
producer-specific photo outcomes, partial job runs, missing or malformed pulse
notes, false duplicate matches across geography/categories, date-line neighbors,
pair caps, CLI output/no-overwrite, credential redaction and collector exhaustion.
All collection queries live in `wayfind_audit/snapshot.py`. When changing them,
regenerate `sql/snapshot.sql` with `uv run python scripts/export_sql.py`; a test
checks that the export remains synchronized. The SQL was verified against the
Wayfind schema; schema changes must fail visibly until the contract is updated.

Start with analysis. A production write, automatic deduplication, new source
acquisition, or scoring model is a separate reviewed change requiring its own
proof of benefit. Per-request cost analysis needs real billing/request logs; it
cannot be reconstructed from the current aggregate ledger.

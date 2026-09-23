# Migration drift audit, 2026-09-23

`scripts/check-migration-reconciliation.mjs` (PR #1476) compares every production
ledger row with its committed file by content. 42 applied migrations did not match
and were recorded in `scripts/migration-content-baseline.json`: 28 differ only in
comments or whitespace, 14 differ in statement text. This file is the review of
those 14. Nothing here edits, re-runs or rewrites an applied migration.

## Method

For each of the 14 versions: the SQL production recorded
(`supabase_migrations.schema_migrations.statements`) and the committed file were
split into statements, comments removed and whitespace collapsed, then compared
statement by statement. Every difference that could change behaviour was then
checked against the live schema (`pg_proc` bodies and attributes,
`pg_get_viewdef`, `pg_constraint`, `information_schema.columns`, object comments,
the one affected data row) on 2026-09-23.

Classes: 1 harmless representation difference; 2 semantically equivalent (live
schema reflects the repo's intent); 3 production has behaviour missing from the
repo; 4 the repo has something production lacks; 5 needs a new forward-only
migration; 6 needs manual investigation.

## Result

| Version | Migration | Difference | Class | Live state | Action |
|---|---|---|---|---|---|
| 20260729193021 | wf_editorial_retry_state | Column comment: the repo has one extra clause | 1 | Production wording is live | None |
| 20260729194309 | wf_atlas_retryable | The committed file was later rewritten to the category version (applied separately as pinned 20260729194414). The live function also has a FAILED VERIFICATION readmission branch and a null-safe attempt count that PR #600 (29767d3c, 2026-08-05) applied straight to the database with no migration | 3 (investigated; source is PR #600) | Live is the intended behaviour; the repo's last definition lacks it | Captured by `20260923_wf_capture_live_function_state.sql` |
| 20260729230154 | wf_inventory_cuisine | Column comment: "with" versus "+" | 1 | Production wording is live | None |
| 20260807004146 | wf_gate_status_core_metros_grant | The repo wraps the same three statements in begin/commit | 1 | Grant and policy live | None |
| 20260813164053 | wf_promote_metros | Function comment: "--" versus an em dash | 1 | Production wording is live | None |
| 20260822230210 | wf_feedback | Table comment: production has one extra sentence | 1 | Production wording is live | None |
| 20260902145417 | wf_promote_global_bucket_opt_in | The repo file also carries the wf_enqueue_promotion global skip (applied separately as pinned 20260902152216), updates bounds on the global row, and rewrites two comments | 2 for behaviour, 4 for two comments | Global skip live in both paths; global row is -90..90 / -180..180 and active; backfill body identical; the repo's new table and function comments were never applied | None (comment-only difference) |
| 20260906060814 | social_intelligence_control_plane | Follower columns and their check constraint are in the repo file; production applied them separately as pinned 20260906061307 | 2 | Both columns and the identical constraint are live | None |
| 20260907065534 | wf_popularity_attempt_ledger | Comments inside the function body and comment text only; the function was replaced three hours later | 1 | Superseded | None |
| 20260907084309 | wf_wikipedia_popularity_eligibility | Production also dropped the (integer) and (text, text[], integer) overloads; the repo never did (20260907_wf_popularity_attempt_ledger.sql lists the drop as a follow-up) | 3 | Only the 5-argument function is live | Captured by `20260923_wf_capture_live_function_state.sql` |
| 20260907113647 | wf_deploy_contract_audit | The repo's wf_schema_objects adds constraint, trigger and index branches (applied separately as pinned 20260907114404); comment text differs | 2 | Live function returns all seven kinds | None |
| 20260909180743 | wf_photo_repair_queue_budget_blocked | Production recorded a LIKE-prefix join for wf_photo_coverage_census; the repo file has the equality join its committed follow-up (20260909181112) applied | 2 | Live view uses the equality join | None |
| 20260916185050 | wf_spend_refund_and_photo_outcomes | Three COMMENT ON statements in the repo file were never applied | 4 (documentation only) | Functions and table live; those three comments are empty | None required |
| 20260921224304 | event_link_manual_verification_and_2026_repairs | One manual-verification note reads "bot wall" in the repo and "429 bot wall" in production | 1 | The one affected row carries the production text | None |

## The two repo gaps

Both are production behaviour the repository did not contain, so a database
rebuilt from `supabase/migrations` would differ from production:

1. It would lose the retry path for pre-2026-08-05 FAILED VERIFICATION editorial
   rows, and would skip rows whose attempt count is null.
2. It would keep three `wf_popularity_stale_batch` overloads with defaulted
   arguments, which PostgREST cannot choose between for a call that names only
   `p_source`.

`20260923_wf_capture_live_function_state.sql` records both. On production it is a
no-op: the function body is byte-identical to the live one (md5
656ac41b8ff3f886ed1e10cdbe06a23b), and the dropped overloads do not exist there.

## Not repaired, on purpose

Production was not changed to make any hash match. The 12 other differences are
comments, whitespace, a transaction wrapper, one data note, or repo text that
production already reflects through a separately applied and pinned migration.

# Proposal — production migrations go through one script, always

- **Lane:** claude (Wayfind lane)
- **Target file if adopted:** `CLAUDE.md`, inserted as a new `##` section immediately after
  the `### gh merge mechanics that will waste your time (2026-07-29)` subsection and before
  `## ✅ Writing an assertion...` — i.e. in the active top-of-file operational-rules zone
  next to "How to ship a fix", not appended after the legacy pasted strategy frameworks
  further down the file (roughly line 568 on), which is not where an operator applying a
  migration will be reading.
- **Origin:** two migration failures on 2026-09-07, same root cause — a migration handled
  partially. #1153's migration was merged, reviewed, and never applied (08:23 UTC popularity
  cron did zero work across all four providers). Applying PR #1155's migration by hand, it
  was reconstructed from three separate grep/sed samples instead of the whole file — the
  samples missed the middle, `wf_schema_objects()` shipped 4 object kinds instead of 7, and
  `scripts/check-migration-reconciliation.mjs` correctly reported two real, live
  editorial-publish-gate objects (a constraint, a trigger) as missing. The guard was right;
  the input to production was wrong. `scripts/apply-migration.mjs` +
  `scripts/lib/migrationApply.mjs` are the mechanism; `scripts/check-migration-apply-canonical-path.mjs`
  is the guard that proves it. Filed here rather than written into `CLAUDE.md` directly,
  which `scripts/check-doc-ownership.mjs` forbids a non-owner commit from doing.
- **Status:** awaiting owner adoption. Not in force in `CLAUDE.md` until it lands under an
  owner commit — though `scripts/check-migration-apply-canonical-path.mjs` enforces the
  mechanism either way, independent of whether this doc is adopted.

## The rule, verbatim, ready to paste

## 🗄️ How to apply a migration to production

**Production migrations are applied only from the complete canonical repo migration file.
Never reconstruct or execute a migration from grep, sed, or snippets.** Two failures on
2026-09-07 earned this rule. #1153's migration was merged, reviewed, and never applied — the
schema was one migration behind the code, and the 08:23 UTC popularity cron did zero work
across all four providers. The same day, applying PR #1155's migration by hand, it was
reconstructed from three separate grep/sed samples instead of the whole file — the samples
missed the middle, `wf_schema_objects()` shipped 4 object kinds instead of 7, and the
brand-new reconciliation guard correctly reported two real, live editorial-publish-gate
objects as missing. **The guard was right to fire. The input to production was wrong.**

**The only way to apply a migration in this repo:**

```
node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

Never `mcp__Supabase__apply_migration` or `execute_sql` with SQL typed, pasted, or
reconstructed by hand — not even "just this one statement", not even to fix a mistake fast.
This script reads the WHOLE file, refuses anything not committed and byte-identical to
`HEAD`, records the filename and a SHA-256 of the exact bytes **before** executing, applies
through the Supabase Management API, and immediately chains
`scripts/check-migration-reconciliation.mjs` into the same run — applying and then not
checking is exactly how the second incident compounded.

If a direct SQL operation is ever genuinely necessary outside normal migration tracking, it
still goes through this script, not around it:

```
node scripts/apply-migration.mjs --emergency-direct-sql --reason "<why>" supabase/migrations/<file>.sql
```

Same whole-file read, same git-committed check, same filename + SHA-256 recorded — never
improvised. This path bypasses Supabase's own migration ledger (no
`supabase_migrations.schema_migrations` row), so it will need a new entry in
`scripts/check-migration-reconciliation.mjs`'s `APPLIED_WITHOUT_LEDGER_ENTRY` allowlist,
naming the object the SHA-256 proves this file created — the script tells you this when you
use it.

After a real apply, **commit `scripts/migration-apply-log.jsonl`.** An applied migration with
no committed record of it is the other half of the 2026-09-07 lesson: a corrective fix
(`wf_schema_objects_full_catalog_fix`) was applied live that day and never committed to the
repo at all.

See `scripts/lib/migrationApply.mjs` for the full incident writeup and
`scripts/check-migration-apply-canonical-path.mjs` for the guard that proves this path
actually refuses fragments and that its SHA-256 recording is real, not decorative.

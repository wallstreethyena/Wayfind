# Canary workflow — installation history

`.github/workflows/canary.yml` (the `routes` / `inventory` / `promote-metros`
jobs — production route contract, inventory data integrity, promote-metros
live drift, all on a 30-minute clock) was authored and committed here as
`ops/canary.workflow.yml` because the credentials available at the time could
not push a NEW `.github/workflows/*.yml` file — GitHub refuses that specific
push shape without the `workflow` OAuth scope.

**2026-09-04 extended guard-honesty audit — found and closed.** The file sat
parked at this path for an unmeasured stretch of time while every doc that
named it (`check-guard-manifest.mjs`'s EXCLUDED reasons for
`check-inventory-integrity.mjs` and `check-promote-metros-live-drift.mjs`,
this file's own original text) said it "runs in the scheduled canary
workflow" as if it did. It did not: GitHub Actions only picks up workflow
files that live under `.github/workflows/`, so `routes` / `inventory` /
`promote-metros` never ran on a single push or a single 30-minute tick.
Nothing exercised the render-level, live-production, and Supabase-drift
checks the guard suite is structurally blind to (see this workflow's own
header comment for the 2026-08-20 incident that motivated it) — for however
long the file sat here.

Moved to `.github/workflows/canary.yml` in that audit
(`git mv ops/canary.workflow.yml .github/workflows/canary.yml`) and added
`scripts/check-canary-workflow-installed.mjs` (wired into
`scripts/guards.txt`) so this cannot silently regress back to a parked file
without failing every future prebuild.

If a future push of `.github/workflows/canary.yml` is ever rejected for the
same OAuth-scope reason, the fix is still:

    gh auth refresh -s workflow          # approve in the browser
    git push

not moving the file back out of `.github/workflows/` — that quietly
recreates this exact gap.

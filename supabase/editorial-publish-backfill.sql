-- editorial-publish-backfill.sql — publish the editorial that was already written.
--
-- WHY THIS EXISTS (v6.49)
--
-- app/api/cron/atlas-build/route.js wrote every row with `verified: false`, and
-- nothing anywhere in the codebase ever set it true. The flag was ticked by hand
-- once, over 2026-07-22..24, and never again. So the fleet has been writing
-- editorial that is invisible from birth.
--
-- Measured on 2026-07-28, against production:
--
--   503  editorial rows total (all standard_version = 'atlas-590-v1')
--   233  verified = true  → the only rows a user can see
--   169  clean (zero validator issues) but verified = false → INVISIBLE
--     2  validator-FLAGGED but verified = true → visible, and should not be
--
-- Those 169 hidden rows are not the leftovers. They average a 515-character
-- why_here and 4.3 sourced facts — the longest and best-sourced writing in the
-- table. Every one of them also clears the independent quality floor used below
-- (hook >= 20 chars, why_here >= 120 chars, at least one sourced fact — the
-- shortest hook among them is 88 characters), so the floor costs nothing here.
-- It is there because it is the SAME bar lib/atlasEditorial.js now applies at
-- write time: a row repaired from the backlog and a row written tomorrow have to
-- mean the same thing by "verified", and re-running this file after a future
-- backlog can never publish a stub.
--
-- v6.49 fixes the cause in code: editorialRow() now derives `verified` from the
-- validator that just ran (`verified: flags === null`), so a row and its own
-- quality evidence can no longer disagree. That fix only applies to rows written
-- FROM NOW ON. This file is the one-time repair of the rows already in the table.
--
-- The read path is NOT touched. Every reader still gates on verified — that gate
-- is what keeps the 101 flagged rows (wrong category, chain-generic copy,
-- unresolvable place_ids, city pins filed as venues) off the site.
-- scripts/check-editorial-publish.mjs fails the build if anyone removes it.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor. Run step 1, read it, then run
-- step 2. Idempotent — re-running changes nothing once it has been applied.

-- ── 1. PREVIEW ──────────────────────────────────────────────────────────────
-- What step 2 will publish. Expect 169 rows on 2026-07-28.
select
  place_id,
  length(why_here)                    as why_len,
  coalesce(jsonb_array_length(facts), 0) as sourced_facts,
  left(coalesce(hook, ''), 70)        as hook,
  written_at
from public.wf_editorial
where verified is not true
  and coalesce(array_length(issues, 1), 0) = 0
  and coalesce(length(btrim(hook)), 0) >= 20
  and coalesce(length(btrim(why_here)), 0) >= 120
  and coalesce(jsonb_array_length(facts), 0) >= 1
order by why_len desc;

-- ── 2. PUBLISH ──────────────────────────────────────────────────────────────
-- Same predicate as the preview, verbatim. `issues` is text[], so an empty array
-- and null both mean "the validator found nothing wrong" — array_length() covers
-- both; `issues is null` alone would silently skip the empty-array rows.
update public.wf_editorial
set verified = true
where verified is not true
  and coalesce(array_length(issues, 1), 0) = 0
  and coalesce(length(btrim(hook)), 0) >= 20
  and coalesce(length(btrim(why_here)), 0) >= 120
  and coalesce(jsonb_array_length(facts), 0) >= 1;

-- ── 3. UNPUBLISH THE TWO FLAGGED ROWS ───────────────────────────────────────
-- Both were hand-ticked on 2026-07-22 despite carrying validator flags:
--   ChIJ8agtN_x-54gRHdNEsnYKCmI — 'category-mismatch-not-a-cafe' (a Brazilian
--                                  churrascaria filed as a cafe)
--   ChIJiwmeCgAxw4gR-PJxRT58WHs — 'limited-source-material'
-- A wrong reason to go is worse than no reason to go, which is the whole premise
-- of keeping the gate. Run this together with step 2, not separately.
update public.wf_editorial
set verified = false
where verified is true
  and coalesce(array_length(issues, 1), 0) > 0;

-- ── 4. VERIFY ───────────────────────────────────────────────────────────────
-- Expect: visible 400, clean_hidden 0, flagged_but_live 0.
select
  count(*)                                                                     as total,
  count(*) filter (where verified)                                             as visible,
  count(*) filter (where verified is not true
                     and coalesce(array_length(issues, 1), 0) = 0)             as clean_hidden,
  count(*) filter (where verified
                     and coalesce(array_length(issues, 1), 0) > 0)             as flagged_but_live
from public.wf_editorial;

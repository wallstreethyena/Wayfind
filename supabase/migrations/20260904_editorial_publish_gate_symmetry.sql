-- 20260904_editorial_publish_gate_symmetry.sql — THE PUBLISH GATE HAD NO INVERSE.
--
-- Owner, 2026-09-04: "audit why is there not more why wayfind picked in the
-- detail cards, almost everyone had it, it was the corn [maze] not saving it,
-- so why not."
--
-- MEASURED CAUSE. wf_editorial holds 922 rows with verified = true. Only 715 of
-- them contain a hook, a why_here or a local_tip. The other 207 are verified,
-- carry no issues, and are EMPTY in every prose field — hook, why_here,
-- know_before and best_time are all null. All 207 join wf_inventory, so all 207
-- are places the site serves while claiming enriched editorial it does not have.
-- That is 22% of the published set, and it is exactly the card the owner
-- reported: present, and silent on why anyone should go.
--
-- They are not a writer failure. They are a GATE ASYMMETRY in
-- supabase/editorial-publish-backfill.sql, which is the file that decides what
-- "verified" means for a row it did not write:
--
--   step 2 PUBLISH   → verified = true  WHERE no issues
--                                        AND length(hook)     >= 20
--                                        AND length(why_here) >= 120
--                                        AND jsonb_array_length(facts) >= 1
--   step 3 UNPUBLISH → verified = false WHERE issues IS NOT EMPTY
--
-- The promote clause tests issues AND CONTENT. The demote clause tests issues
-- ALONE. They are not inverses, so a row that was already verified = true (the
-- 2026-07-22 hand-ticked set, and anything promoted before the content bar
-- existed) can fail every content test the same file applies to newcomers and
-- still be immune to its own demotion. Nothing in the repo ever asked "is a
-- PUBLISHED row still publishable?" — only "is an unpublished row publishable
-- yet?", which is the one direction that cannot catch this.
--
-- The code path for NEW rows is already correct: lib/atlasEditorial.contentIssues
-- flags thin-hook / insufficient-why-here / no-sourced-facts and editorialRow
-- derives `verified: flags === null` from it. So this is a data repair plus a
-- standing invariant, not a behaviour change to the writer.
--
-- WHAT THIS DOES NOT CHANGE: nothing a user can see. lib/rankingWhy.fromRow
-- already returns null for a row with no why_here and no hook, and
-- lib/knownFor refuses the same shape, so these 207 cards render no why block
-- today whether they are flagged or not. What changes is that the DATABASE
-- stops asserting something false, "922 verified" becomes a number that means
-- what it says, and the rows become findable as work to do instead of
-- invisible as work already done.
--
-- REVERSIBLE. Every row this demotes is stamped with the exact issues flag
-- 'empty-published-row', so the inverse is one statement:
--   update public.wf_editorial set verified = true, issues = null
--    where issues = array['empty-published-row'];
--
-- Idempotent: re-running demotes nothing new once the invariant holds.

-- ── 1. DEMOTE: the exact inverse of the publish predicate ───────────────────
-- Same three thresholds as editorial-publish-backfill.sql step 2, negated.
-- Duplicated deliberately and for the same reason that file gives: a row
-- written today and a row repaired from the backlog have to clear the same
-- bar, or "verified" means two different things depending on when it was
-- written.
update public.wf_editorial
set verified = false,
    issues   = array['empty-published-row']
where verified is true
  and coalesce(array_length(issues, 1), 0) = 0
  and (
       coalesce(length(btrim(hook)), 0) < 20
    or coalesce(length(btrim(why_here)), 0) < 120
    or coalesce(jsonb_array_length(facts), 0) < 1
  );

-- ── 2. THE INVARIANT, ENFORCED BY THE DATABASE ─────────────────────────────
-- A CHECK constraint is what makes this unrepeatable. Neither a future
-- backfill, nor a hand UPDATE in the SQL editor, nor a writer regression can
-- put an empty row back into the published set: the write is refused, loudly,
-- at the moment it is attempted rather than discovered 207 rows later.
--
-- NOT VALID is deliberate and is not a weakening. It skips the full-table
-- re-scan at apply time (step 1 above has already made every existing row
-- conform) while enforcing the rule on every INSERT and UPDATE from this
-- moment on. The VALIDATE below then confirms the existing rows too, without
-- holding the stronger lock during the scan.
alter table public.wf_editorial
  drop constraint if exists wf_editorial_verified_needs_content;

alter table public.wf_editorial
  add constraint wf_editorial_verified_needs_content
  check (
    verified is not true
    or (
         coalesce(length(btrim(hook)), 0) >= 20
     and coalesce(length(btrim(why_here)), 0) >= 120
     and coalesce(jsonb_array_length(facts), 0) >= 1
    )
  ) not valid;

alter table public.wf_editorial
  validate constraint wf_editorial_verified_needs_content;

comment on constraint wf_editorial_verified_needs_content on public.wf_editorial is
  'A published row must carry the content it claims: hook >= 20 chars, why_here >= 120, at least one sourced fact — the same bar lib/atlasEditorial.contentIssues applies to newly written rows. Added 2026-09-04 after 207 verified rows were found empty in every prose field because the publish backfill''s demote clause tested `issues` while its promote clause tested issues AND content.';

-- ── 3. VERIFY ──────────────────────────────────────────────────────────────
-- Expect: empty_but_published 0, and demoted_this_run equal to however many
-- rows step 1 caught (207 at authoring time).
select
  count(*) filter (where verified)                                          as published,
  count(*) filter (where verified
                     and (coalesce(length(btrim(hook)), 0) < 20
                       or coalesce(length(btrim(why_here)), 0) < 120
                       or coalesce(jsonb_array_length(facts), 0) < 1))      as empty_but_published,
  count(*) filter (where issues = array['empty-published-row'])             as demoted_this_run
from public.wf_editorial;

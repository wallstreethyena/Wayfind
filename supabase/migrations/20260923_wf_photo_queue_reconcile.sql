-- wf_photo_repair_queue: reconcile free-recoverable rows regardless of
-- schedule, and un-pin the leftover Oct-1 rows the 2026-09-09 fix's data
-- migration never reached.
--
-- THE DEFECT (measured in production, 2026-09-23, Lane L2b follow-up
-- audit). 557 open wf_photo_repair_queue rows, and two distinct classes of
-- them were never going to close on their own:
--
--   (1) STALE ROWS (24 rows -- audit buckets A3/F). q.status='open' with an
--   ACTIVE wf_place_photo (a real, servable, free Wikimedia photo) already
--   sitting right next to it -- but the queue row stays open because
--   lib/photoRepair.js's runRepair() only ever looks at a row when it comes
--   DUE (next_attempt_at <= now(), ordinary 1h-7d backoff) or is
--   budget_blocked. A vault entry going active is an EVENT, not a clock
--   tick -- it can land the INSTANT after a row's last drain and then sit
--   invisible to the worker for up to 7 more days (verified: every sampled
--   A3 row's wf_place_photo.created_at is HOURS after its
--   wf_photo_repair_queue.updated_at, inside the row's own current backoff
--   window). Money is never involved in this path (findFreePhoto/
--   findSamePlaceCachedPhoto are both free, read-only lookups) so there is
--   no reason a real recovery should ever wait on a backoff clock built to
--   throttle PAID attempts.
--
--   (2) THE OCTOBER 1ST PIN'S LEFTOVERS (58 rows). #1222's migration
--   (20260909_wf_photo_repair_queue_budget_blocked.sql) un-pinned the 173
--   rows it could find via `where status='open' and
--   failure_reason='spend-restricted'` -- but that commit's own measurement
--   (git log 1a715283) recorded 408 open rows pinned to
--   next_attempt_at=2026-10-01T00:00:00Z that same day: 173
--   spend-restricted (caught) AND 234 source-unavailable (NOT caught -- the
--   migration's WHERE clause never matched failure_reason='source-unavailable',
--   only 'spend-restricted'). 58 of those 234 are still sitting exactly
--   where that day left them (updated_at=2026-09-09, next_attempt_at still
--   2026-10-01T00:00:00Z, verified against production). A pinned OPEN row
--   is never budget_blocked (no blocked_since, invisible to the
--   budget-release select too) -- it just silently waits three extra weeks
--   past even its own worst-case 7-day backoff for a FREE check that never
--   needed to wait on money in the first place.
--
-- THE FIX HAS TWO HALVES, mirroring #1222's own shape.
--
-- (A) THIS MIGRATION never schedules a row past its own honest backoff
-- ceiling. backoffMs's longest step is 168h (7 days) -- see
-- lib/photoCoverage.js -- so ANY status='open' row whose next_attempt_at
-- sits more than 7 days out is, by construction, not a real schedule; it is
-- a leftover calendar pin from the retired spend-restricted path (whichever
-- of the two migration passes missed it). This UPDATE is deliberately NOT
-- keyed to the literal '2026-10-01' value (that would fix today's incident
-- and nothing else) -- it matches the INVARIANT the bug violated, so it
-- also catches any other pinned row this repo has not yet found. Un-pinned
-- to now(): the very next drain re-evaluates it with the CURRENT (fixed)
-- code, same as #1222's own release semantics -- never a fabricated
-- recovery, just an honest re-ask. attempts and failure_reason are left
-- untouched (this is a scheduling correction, not a reclassification).
--
-- (B) wf_photo_queue_reconcilable (view, below) is the free-recovery fix,
-- wired into lib/photoRepair.js's fetchDueRows in the same lane's JS
-- change: a THIRD select, run on every drain, unconditionally (no budget
-- gate -- both paths it names are free), that finds every open/
-- budget_blocked row with a real free recovery sitting RIGHT NOW: an active
-- wf_place_photo for the place, or a fresh (unexpired) exact-ref cache row
-- for the place's CURRENT photo_ref (the same photo|<ref>|<width> key shape
-- wf_photo_coverage_census already proved is the correct, index-friendly
-- join -- split_part(k,'|',2) equality, never a LIKE built from the joined
-- column). A row this view names is processed THAT drain regardless of
-- next_attempt_at, status, or the ledger -- closing it costs nothing and
-- was never supposed to wait.
--
-- security_invoker=true (this repo's standing rule for every read view --
-- 20260905_editorial_read_gate.sql), service_role only, matching
-- wf_photo_queue_census's own posture. Idempotent: `create or replace view`
-- and an UPDATE that only ever matches rows still shaped like the leftover
-- bug (a second run finds none once the first has un-pinned them).

-- ── (A) un-pin any OPEN row scheduled past its own honest backoff ceiling ──
update public.wf_photo_repair_queue
set next_attempt_at = now(),
    updated_at = now()
where status = 'open'
  and next_attempt_at > now() + interval '7 days';

-- ── (B) wf_photo_queue_reconcilable — free-recoverable, right now ─────────
create or replace view public.wf_photo_queue_reconcilable
with (security_invoker = true) as
select
  q.place_id,
  q.current_ref,
  q.attempts,
  q.status,
  q.blocked_since,
  q.failure_reason
from public.wf_photo_repair_queue q
join public.wf_inventory i on i.place_id = q.place_id
where q.status in ('open', 'budget_blocked')
  and (
    exists (
      select 1
      from public.wf_place_photo vp
      where vp.place_id = q.place_id
        and vp.status = 'active'
    )
    or (
      i.photo_ref is not null
      and exists (
        select 1
        from public.wf_places_cache c
        where c.k like 'photo|%'
          and split_part(c.k, '|', 2) = i.photo_ref
          and c.exp > now()
      )
    )
  );

revoke all on public.wf_photo_queue_reconcilable from anon, authenticated;
grant select on public.wf_photo_queue_reconcilable to service_role;

comment on view public.wf_photo_queue_reconcilable is
  'Rows in wf_photo_repair_queue (status open or budget_blocked) that are recoverable for FREE right now: an active wf_place_photo vault row for the place, or a fresh (unexpired) exact-ref cache row for the place''s current wf_inventory.photo_ref. lib/photoRepair.js''s fetchDueRows selects this view unconditionally on every drain (no budget gate, no next_attempt_at filter) so a real free recovery is never delayed by a backoff clock built for paid attempts, or by a stale/legacy next_attempt_at pin (2026-09-23 Lane L2b fix, sibling to #1222''s 2026-09-09 budget_blocked fix). security_invoker=true, service_role only.';

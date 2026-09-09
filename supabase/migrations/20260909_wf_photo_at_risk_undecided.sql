-- 20260909_wf_photo_at_risk_undecided.sql
--
-- THE WORKER'S WORKLIST, AS OPPOSED TO THE OPERATOR'S REPORT.
--
-- `public.wf_photo_at_risk` (20260909_wf_place_photo_vault.sql) answers the
-- REPORTING question — "which places still have a live Google photo cache row
-- and no permanent photo of our own?" — and its own comment says, on purpose:
-- "A place with a rejected (never active) wf_place_photo row still appears
-- here on purpose: rejected means no free-licensed substitute exists yet, not
-- that the place stopped being at risk." That contract is correct and is not
-- changed by this migration.
--
-- It is the wrong list to hand a WORKER, and measured production numbers say
-- how wrong. lib/placePhotoBackfill.js reads ONE PostgREST page of that view
-- (`order=earliest_expiry.asc`; the project's `max-rows` is 1000, so a single
-- request can never see past row 1000 whatever `limit` asks for), then drops
-- every place that already holds ANY wf_place_photo row. On 2026-09-09 the
-- first 1000 rows held 123 already-decided places and 877 undecided ones, out
-- of 5,053 at-risk / 4,494 undecided overall. Commons coverage resolves only
-- about 6% of candidates, so ~94% of every decision is a REJECTION — and a
-- rejection stays in the reporting view forever. The drain therefore fills its
-- own first page with its own rejections: after ~877 further decisions the
-- first 1000 rows are 100% decided, the single page yields zero candidates,
-- and the worker stalls permanently at roughly 1000 of 5,053 places. At the
-- 600 decisions/day this lane now runs (v8.56.14), that is about 35 hours away,
-- against a first cached-photo expiry of 2026-09-25.
--
-- The fix is a worklist that cannot contain a place the worker is unable to
-- act on, so the first page is always actionable and no pagination — keyset or
-- otherwise — is needed at all. LAYERED on wf_photo_at_risk rather than copied
-- from it, so "at risk" keeps exactly one definition, `undecided ⊂ at-risk`
-- holds by construction, and the inner view's WHERE (which a partial index
-- must match verbatim — `~~` has no btree opfamily, so predicate implication
-- between two different LIKE patterns is unprovable) stays in one place.
--
-- NOT `and p.status = 'active'`, unlike the inner view: ANY row means the
-- worker has already decided this place and will skip it client-side anyway.
-- This moves that filter server-side, where it can be paged past.

create or replace view public.wf_photo_at_risk_undecided
  with (security_invoker = true) as
select r.place_id, r.name, r.category, r.earliest_expiry
from public.wf_photo_at_risk r
where not exists (
  select 1 from public.wf_place_photo p where p.place_id = r.place_id
)
order by r.earliest_expiry asc;

revoke all on public.wf_photo_at_risk_undecided from anon, authenticated;
grant select on public.wf_photo_at_risk_undecided to service_role;

comment on view public.wf_photo_at_risk_undecided is
  'The permanent-photo-vault WORKER worklist (2026-09-09): public.wf_photo_at_risk minus every place that already holds ANY public.wf_place_photo row -- active OR rejected -- ordered by earliest_expiry ascending. Distinct from wf_photo_at_risk, which is the OPERATOR REPORT and deliberately keeps rejected places visible ("rejected means no free-licensed substitute exists yet, not that the place stopped being at risk"). A worker handed that report starves: it reads one 1000-row PostgREST page, and because ~94% of its own decisions are rejections that stay in the report, it eventually fills that page with places it cannot act on and stalls -- measured 2026-09-09 at roughly 35 hours away. Layered on wf_photo_at_risk rather than duplicating it so "at risk" has one definition and undecided is a strict subset by construction. service_role only.';

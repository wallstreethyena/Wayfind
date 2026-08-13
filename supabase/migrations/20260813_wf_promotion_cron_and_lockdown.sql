-- 20260813_wf_promotion_cron_and_lockdown.sql
--
-- Two things the first three migrations left open, both caught by running the
-- Supabase security advisor immediately after apply rather than by assuming the
-- defaults were safe.

-- ============================================================================
-- 1. SCHEDULING
-- ============================================================================
-- wf-geo-coverage-refresh is ACTIVE: it only aggregates rows Wayfind already
-- owns, costs nothing, and is what makes a thin neighbourhood visible.
--
-- wf-promotion-reconcile is created and IMMEDIATELY DEACTIVATED. Enqueueing is
-- free, but it commits the worker to Place Details spend the moment that worker
-- is deployed (~4,732 places x $0.017 = ~$80 one-off across the four served
-- metros). Turning that on is the owner's call, not a migration's:
--
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'wf-promotion-reconcile'),
--     active := true);
--
-- NOTE: `update cron.job set active = false` fails with "permission denied for
-- table job" on Supabase. cron.alter_job() is the supported path.

select cron.schedule('wf-geo-coverage-refresh', '20 4 * * *',
  $$select public.wf_refresh_geo_coverage(5)$$);

select cron.schedule('wf-promotion-reconcile', '40 4 * * *',
  $$select public.wf_promotion_backfill(null, 2000)$$);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'wf-promotion-reconcile'),
  active := false);

-- ============================================================================
-- 2. LOCKDOWN
-- ============================================================================
-- Everything in this pipeline is INTERNAL. The enqueue trigger runs inside
-- Postgres; the worker authenticates with the service role, which bypasses both
-- RLS and these grants. Nothing here should be reachable from a browser.
--
-- What the advisor found on the newly-created objects:
--   ERROR rls_disabled_in_public  x3  anon could read AND WRITE the queue
--   ERROR security_definer_view   x1  wf_promotion_health ran as its creator
--   WARN  anon/authenticated EXECUTE on all ten functions —
--         /rest/v1/rpc/wf_promotion_backfill was callable by anyone holding the
--         publishable key. They could enqueue 2,000 places, mark the queue done,
--         or drain it out from under the worker.

alter table public.wf_promote_metros   enable row level security;
alter table public.wf_promotion_queue  enable row level security;
alter table public.wf_geo_coverage     enable row level security;
-- RLS on with NO policies: service role bypasses, everyone else gets nothing.
-- Same posture as the ~19 other internal wf_* tables on this project.

drop view if exists public.wf_promotion_health;
create view public.wf_promotion_health with (security_invoker = on) as
  select q.metro,
         q.status,
         count(*)                                        as places,
         sum(case when q.attempts > 0 then 1 else 0 end) as attempted,
         max(q.last_attempt_at)                          as last_attempt_at,
         max(q.promoted_at)                              as last_promoted_at,
         (array_agg(q.reject_reason order by q.last_attempt_at desc nulls last)
            filter (where q.reject_reason is not null))[1] as newest_reject_reason
    from public.wf_promotion_queue q
   group by q.metro, q.status;

comment on view public.wf_promotion_health is
  'Queue depth and drain rate by metro and status. security_invoker so it cannot be used to read around the queue RLS.';

-- wf_geohash is pure arithmetic but still needs a pinned search_path, or a
-- role-local search_path could shadow substr/power. Redefined with
-- `set search_path = pg_catalog`; see 20260813_wf_geo_coverage.sql for the body.
alter function public.wf_geohash(double precision, double precision, integer)
  set search_path = pg_catalog;

-- THE PART THAT ACTUALLY MATTERS. A first pass revoked from anon/authenticated
-- and changed NOTHING — has_function_privilege('anon', ...) still returned true
-- for all ten. Postgres grants EXECUTE to PUBLIC on every new function, and
-- anon/authenticated inherit it; revoking from the roles leaves PUBLIC standing.
-- Verified after applying, not assumed.
do $$
declare f text;
begin
  foreach f in array array[
    'public.wf_bucket_metro(double precision, double precision)',
    'public.wf_geohash(double precision, double precision, integer)',
    'public.wf_coverage_at(double precision, double precision)',
    'public.wf_refresh_geo_coverage(integer)',
    'public.wf_enqueue_promotion(text, text)',
    'public.wf_promotion_claim(text, integer, integer)',
    'public.wf_promotion_complete(text, boolean, text, boolean)',
    'public.wf_promotion_retry(text, text, integer)',
    'public.wf_promotion_backfill(text, integer)',
    'public.wf_place_ids_enqueue_trg()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role, postgres', f);
  end loop;
end $$;

-- Post-apply verification (all ten returned f/f/t, and the enqueue trigger still
-- fired on a real wf_place_ids touch afterwards):
--   select p.proname,
--          has_function_privilege('anon',         p.oid,'execute'),
--          has_function_privilege('authenticated',p.oid,'execute'),
--          has_function_privilege('service_role', p.oid,'execute')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname like 'wf_promotion%';

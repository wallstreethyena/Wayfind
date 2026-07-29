-- wf_job_pulse — the heartbeat a metered job leaves behind, so "it ran" and
-- "it accomplished something" are separate facts.
--
-- WHY THIS EXISTS. atlas-build returned HTTP 200 on every invocation for five
-- days while publishing nothing: 525 rows written, 0 published. Four layers
-- reported green (the 200s, a guard asserting the cron was scheduled, an env
-- audit that only checked key presence, and an Anthropic spend column nobody
-- read). The earliest available signal was that spend went to ZERO on
-- 2026-07-22 and stayed there -- five days before anyone noticed.
--
-- The generic shape: a job that ATTEMPTS work and SUCCEEDS at none of it,
-- repeatedly. Nothing about that is specific to atlas-build or to Anthropic;
-- the same pattern catches Google Places going quiet, blurbs, or any metered
-- job added later.
--
-- Deliberately NOT a provider billing integration: billing APIs lag hours to
-- days, and the fact we care about -- this job stopped accomplishing anything --
-- is observable locally and immediately.
create table if not exists public.wf_job_pulse (
  id           bigserial primary key,
  job          text        not null,
  ran_at       timestamptz not null default now(),
  attempted    integer     not null default 0,
  succeeded    integer     not null default 0,
  failed       integer     not null default 0,
  note         text
);

create index if not exists wf_job_pulse_job_ran_idx on public.wf_job_pulse (job, ran_at desc);

comment on table public.wf_job_pulse is
  'Per-run heartbeat for metered jobs. attempted>0 with succeeded=0 across consecutive runs is the incident signal (see /api/cron/job-watch). Added 2026-07-29 after atlas-build ran 100% failed for five days behind HTTP 200s.';

-- Consecutive-zero is computed HERE rather than in JS so the alerting route and
-- any dashboard cannot disagree about what "dead" means.
create or replace function public.wf_job_health(p_lookback_hours integer default 48)
returns table(job text, runs integer, last_run timestamptz, attempted bigint,
              succeeded bigint, consecutive_zero integer, last_note text)
language sql
stable
set search_path to 'public'
as $function$
  with recent as (
    select p.*, row_number() over (partition by p.job order by p.ran_at desc) as rn
    from public.wf_job_pulse p
    where p.ran_at > now() - make_interval(hours => greatest(1, coalesce(p_lookback_hours, 48)))
  ),
  -- A run "did nothing" when it tried and got zero back. A run that attempted
  -- nothing is IDLE, not broken, and must not count toward the streak --
  -- otherwise a self-terminating job pages every hour and the alert gets muted.
  flagged as (
    select r.*, (r.attempted > 0 and r.succeeded = 0) as dead from recent r
  ),
  streak as (
    select f.job, count(*)::int as consecutive_zero
    from flagged f
    where f.dead
      and f.rn <= coalesce(
        (select min(f2.rn) - 1 from flagged f2 where f2.job = f.job and not f2.dead),
        (select max(f3.rn) from flagged f3 where f3.job = f.job))
    group by f.job
  )
  select r.job,
         count(*)::int                       as runs,
         max(r.ran_at)                       as last_run,
         sum(r.attempted)                    as attempted,
         sum(r.succeeded)                    as succeeded,
         coalesce(max(s.consecutive_zero),0) as consecutive_zero,
         (array_agg(r.note order by r.ran_at desc) filter (where r.note is not null))[1] as last_note
  from recent r
  left join streak s on s.job = r.job
  group by r.job
$function$;

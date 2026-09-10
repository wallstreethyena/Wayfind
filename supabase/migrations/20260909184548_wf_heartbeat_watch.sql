-- wf_heartbeat_watch — the READING side of #1218.
--
-- #1218 gave every scheduled monitor (canary, synthetic-monitor, photo-monitor)
-- a heartbeat: a wf_job_pulse row on EVERY run, pass or fail, via
-- scripts/record-workflow-pulse.mjs. What it explicitly did not ship (see its
-- own commit message) is anyone reading that heartbeat for SILENCE. That gap
-- is real: wf_job_health() only returns rows for jobs that already appear in
-- its lookback window (default 48h). A job with ZERO rows in that window is
-- not "unhealthy" in that view -- it is simply ABSENT from it, same as a job
-- that was never invented. /api/cron/job-watch, which emails incidents out of
-- that view, can only alert on a job it can see.
--
-- Measured 2026-09-09 (see #1218's commit): canary and synthetic-monitor both
-- declare `cron: "*/30 * * * *"` and GitHub actually ran them roughly every
-- 3.5 hours -- it drops the large majority of scheduled Actions invocations
-- under load. That is why this cannot be "alert if no row in the last 30
-- minutes": a threshold that tight would page on GitHub's ordinary behaviour,
-- not on an outage, and get muted within a day. The thresholds below are set
-- well above the worst gaps actually observed, on purpose.
--
-- WHY A THIRD CLOCK. #1218's commit is explicit that this reading side
-- "belongs on a clock independent of both GitHub and Vercel". job-watch
-- itself runs on Vercel Cron; if Vercel's scheduler were the thing that broke,
-- the one route watching for silence would itself go silent, and nothing
-- would say so. Supabase pg_cron already runs three Wayfind jobs
-- (wf-geo-coverage-refresh, wf-promotion-reconcile, wf-affiliate-link-integrity)
-- as plain in-database SQL -- a scheduler that lives inside Postgres, entirely
-- outside both GitHub Actions and Vercel. This migration adds a fourth.
--
-- HOW IT PLUGS IN, RATHER THAN ADDING A NEW ALERT PATH. wf_heartbeat_watch()
-- does not send email and does not call out over the network. It writes ONE
-- wf_job_pulse row for a job named 'heartbeat-watch': succeeded=1 when every
-- expected monitor's last beat is within its allowed staleness, succeeded=0
-- (a "dead" run in wf_job_health's own vocabulary) the moment any of them
-- is not. Two consecutive dead runs is already job-watch's own
-- DEAD_RUN_THRESHOLD (lib/jobPulse.js) for turning a streak into an emailed
-- incident, and 'heartbeat-watch' itself can never go silent the way canary
-- can -- it is driven by Postgres's own clock, on a table it writes to
-- directly, not by a GitHub- or Vercel-scheduled process fetching anything.
-- So the existing, already-tested alerting pipeline (classifyHealth ->
-- job-watch -> Resend, with its existing 24h reminder + recovery logic) now
-- also covers "a monitor stopped reporting at all", with no new email
-- template, no new state table, and no new failure mode of its own to guard.
--
-- KEEPING THIS TABLE HONEST. The three seeded rows below must stay in sync
-- with EXPECTED_HEARTBEAT_WATCH_JOBS in lib/heartbeatWatch.js, which mirrors
-- them for scripts/check-heartbeat-watch-coverage.mjs -- a guard cannot reach
-- this live table from CI, so the JS constant is the reviewable proxy for it.
-- A job added to canary.yml / synthetic-monitor.yml / photo-monitor.yml
-- without a matching row here inherits exactly the hole this migration closes;
-- the guard catches the JS/workflow half of that, this comment is the human
-- reminder for the SQL half.

create table if not exists public.wf_heartbeat_expected (
  job                   text primary key,
  max_staleness_minutes integer not null check (max_staleness_minutes > 0),
  note                  text,
  created_at            timestamptz not null default now()
);

comment on table public.wf_heartbeat_expected is
  'Which scheduled monitors wf_heartbeat_watch() checks, and how stale their last wf_job_pulse row may get before that counts as overdue. Keep in sync with EXPECTED_HEARTBEAT_WATCH_JOBS in lib/heartbeatWatch.js.';

-- created_at is intentionally NOT part of the upsert below (it is only set by
-- DEFAULT on the first insert) -- it is also the BOOTSTRAP BASELINE a job with
-- zero pulse rows is measured against (see wf_heartbeat_overdue()). canary and
-- synthetic-monitor had zero 'canary'/'synthetic-monitor' rows in
-- wf_job_pulse at the moment this migration was written -- #1218 (the write
-- side) had just merged and neither had gotten its first scheduled run yet.
-- Measuring "never run" against the beginning of time would have paged on
-- this migration's own deploy, for a job that simply had not had its first
-- chance to beat yet. Measuring it against created_at instead means a
-- never-run job gets the SAME grace window an intermittent one gets, counted
-- from when this system started watching it, and a later `on conflict`
-- re-run of this migration cannot reset that clock back to "just started".
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note) values
  ('canary',             360, 'declares */30 (30min); GitHub observed running it ~every 3.5h. 6h ceiling is well above that observed gap.'),
  ('synthetic-monitor',  360, 'declares */30 (30min); same GitHub scheduling loss as canary, same 6h ceiling.'),
  ('photo-monitor',      240, 'declares hourly at :50 (.github/workflows/photo-monitor.yml); 4h ceiling gives headroom for the same class of dropped runs without the wait canary/synthetic get.')
on conflict (job) do update set
  max_staleness_minutes = excluded.max_staleness_minutes,
  note                  = excluded.note;

alter table public.wf_heartbeat_expected enable row level security;
-- RLS on, no policies: service_role bypasses (and so does the postgres role
-- pg_cron runs as); anon/authenticated get nothing. Same posture as every
-- other internal wf_* table.

-- Which of the expected jobs are currently overdue, and by how much.
-- Deliberately unbounded lookback (unlike wf_job_health's 48h default) --
-- the entire point is to find a job whose last beat is much older than 48h.
--
-- A job with NO pulse row ever is measured against e.created_at, not against
-- "always overdue" -- see the comment on the seed INSERT above for why: a
-- job that has genuinely never had the chance to beat yet (just added, or
-- watched from the moment this migration deployed) gets the same staleness
-- window an intermittent job gets, rather than paging immediately.
create or replace function public.wf_heartbeat_overdue()
returns table(job text, last_run timestamptz, minutes_since numeric, max_staleness_minutes integer)
language sql
stable
set search_path to 'public'
as $function$
  select e.job,
         lp.last_run,
         case when lp.last_run is null then null
              else round(extract(epoch from (now() - lp.last_run)) / 60.0, 1)
         end as minutes_since,
         e.max_staleness_minutes
    from public.wf_heartbeat_expected e
    left join lateral (
      select max(p.ran_at) as last_run
        from public.wf_job_pulse p
       where p.job = e.job
    ) lp on true
   where coalesce(lp.last_run, e.created_at) < now() - make_interval(mins => e.max_staleness_minutes)
$function$;

revoke all on function public.wf_heartbeat_overdue() from public, anon, authenticated;
grant execute on function public.wf_heartbeat_overdue() to service_role, postgres;

-- The heartbeat FOR the heartbeat check. Fail-soft is unnecessary here the
-- way it is in scripts/record-workflow-pulse.mjs (that script protects a
-- GitHub Actions run from being failed by a Supabase blip) -- this function
-- IS the write, running inside Postgres itself, so there is no outer job to
-- protect. A raised exception here would only fail the pg_cron run, which
-- already retries on its own schedule.
create or replace function public.wf_heartbeat_watch()
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_overdue_count integer;
  v_expected_count integer;
  v_note text;
begin
  select count(*) into v_expected_count from public.wf_heartbeat_expected;

  select count(*),
         string_agg(
           job || ' (' || coalesce(minutes_since::text || 'min', 'never') || ' vs ' || max_staleness_minutes || 'min max)',
           '; ' order by coalesce(minutes_since, 999999) desc
         )
    into v_overdue_count, v_note
    from public.wf_heartbeat_overdue();

  if v_overdue_count = 0 then
    insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
    values ('heartbeat-watch', 1, 1, 0,
      'healthy: ' || v_expected_count || ' watched heartbeat(s) current');
  else
    insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
    values ('heartbeat-watch', 1, 0, 1,
      'OVERDUE (' || v_overdue_count || '/' || v_expected_count || '): ' || left(v_note, 180));
  end if;
end;
$function$;

revoke all on function public.wf_heartbeat_watch() from public, anon, authenticated;
grant execute on function public.wf_heartbeat_watch() to service_role, postgres;

-- Every 15 minutes: with job-watch's DEAD_RUN_THRESHOLD=2, a real overdue
-- monitor becomes an incident within 30 minutes of crossing its threshold,
-- and recovers on the very next tick once the watched job beats again.
select cron.schedule('wf-heartbeat-watch', '*/15 * * * *',
  $$select public.wf_heartbeat_watch()$$);
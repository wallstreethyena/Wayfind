-- Heartbeat tolerance for the daily anchor-watch GitHub workflow
-- (.github/workflows/anchor-watch.yml, 11:17 UTC). Daily cron plus GitHub's
-- measured worst scheduling gap (~517 min, see 20260930120000) means a healthy
-- run can land a day late; 2880 min (48h) pages only after a full missed day
-- plus slack. Insert-only: never overwrites an existing row.
-- scripts/check-heartbeat-tolerance.mjs requires a row for every
-- GitHub-scheduled job that calls recordPulse.
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('anchor-watch', 2880, 'GitHub cron 17 11 * * * daily; 48h allows a full missed day plus GitHub scheduling lag. Watches major Florida anchor events for missing/changed editions.')
  ) as v(job, mins, note)
 where not exists (
   select 1 from public.wf_heartbeat_expected e where e.job = v.job
 );

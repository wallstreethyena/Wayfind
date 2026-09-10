-- Repo-own the two production pg_cron schedules that matter to this lane.
--
-- This is NOT a no-op migration. It has three explicit states per job:
--   missing      -> create the expected schedule
--   exact match  -> leave it untouched
--   any drift    -> RAISE and refuse the migration rather than overwrite live
--
-- That makes the repository the reviewed source without silently changing an
-- operator-tuned or otherwise unexpected production schedule.

do $managed_cron$
declare
  expected record;
  actual record;
  job_count integer;
begin
  for expected in
    select *
      from (values
        (
          'wf-affiliate-link-integrity'::text,
          '13 */3 * * *'::text,
          'select public.wf_verify_affiliate_links();'::text,
          'postgres'::text,
          'postgres'::text
        ),
        (
          'wf-heartbeat-watch'::text,
          '*/15 * * * *'::text,
          'select public.wf_heartbeat_watch()'::text,
          'postgres'::text,
          'postgres'::text
        )
      ) as v(jobname, schedule, command, database_name, username_name)
  loop
    select count(*)
      into job_count
      from cron.job
     where jobname = expected.jobname;

    if job_count = 0 then
      perform cron.schedule(expected.jobname, expected.schedule, expected.command);
    elsif job_count > 1 then
      raise exception using
        errcode = 'P0001',
        message = format('managed cron drift: %s has %s rows; expected exactly one', expected.jobname, job_count);
    end if;

    select j.schedule, j.command, j.active, j.database, j.username
      into actual
      from cron.job j
     where j.jobname = expected.jobname;

    if actual.schedule is distinct from expected.schedule
       or actual.command is distinct from expected.command
       or actual.active is distinct from true
       or actual.database is distinct from expected.database_name
       or actual.username is distinct from expected.username_name then
      raise exception using
        errcode = 'P0001',
        message = format(
          'managed cron drift: %s differs from repo contract; refusing to overwrite live schedule',
          expected.jobname
        );
    end if;
  end loop;
end
$managed_cron$;

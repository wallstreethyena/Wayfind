-- Repo-own the pg_cron states that matter to the verify-offers reliability lane.
--
-- The expected states are intentionally different:
--   * wf-heartbeat-watch is a live monitor and MUST exist, match, and be active.
--   * wf-affiliate-link-integrity is a RETIRED legacy writer. PR #1251 found
--     that it could write false healthy state on HTTP 403, so it MUST NOT be
--     active. If the retired job has already been removed entirely, that is
--     also safe and this contract does not recreate it.
--
-- For an existing job, drift fails loudly. Nothing here silently rewrites a
-- schedule, command, database, user, or active state.

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
          'postgres'::text,
          false
        ),
        (
          'wf-heartbeat-watch'::text,
          '*/15 * * * *'::text,
          'select public.wf_heartbeat_watch()'::text,
          'postgres'::text,
          'postgres'::text,
          true
        )
      ) as v(jobname, schedule, command, database_name, username_name, must_be_active)
  loop
    select count(*)
      into job_count
      from cron.job
     where jobname = expected.jobname;

    if job_count = 0 then
      if expected.must_be_active then
        perform cron.schedule(expected.jobname, expected.schedule, expected.command);
      else
        -- A retired writer being absent is at least as safe as being present
        -- and disabled. Do not recreate obsolete machinery merely for parity.
        continue;
      end if;
    elsif job_count > 1 then
      raise exception using
        errcode = 'P0001',
        message = format('managed cron drift: %s has %s rows; expected at most one', expected.jobname, job_count);
    end if;

    select j.schedule, j.command, j.active, j.database, j.username
      into actual
      from cron.job j
     where j.jobname = expected.jobname;

    if actual.schedule is distinct from expected.schedule
       or actual.command is distinct from expected.command
       or actual.active is distinct from expected.must_be_active
       or actual.database is distinct from expected.database_name
       or actual.username is distinct from expected.username_name then
      raise exception using
        errcode = 'P0001',
        message = format(
          'managed cron drift: %s differs from repo contract; refusing to overwrite live state',
          expected.jobname
        );
    end if;
  end loop;
end
$managed_cron$;

-- wf_photo_credit_purge_expired: delete photo credit rows that are definitely
-- past their own expiry, in bounded batches, every hour. Pure SQL inside the
-- database: no Google request of any kind, no application code, no new spend.
--
-- WHY (owner requirement, 2026-09-29). wf_photo_credit (20260924120000) hides
-- expired rows from readers through RLS but never removes them. Measured on
-- 2026-09-29: 90,886 rows, 189 MB, 54,224 already expired, 0 new rows since
-- the 2026-09-24 backfill. The newest row in the table expires at
-- 2026-10-16 15:01 UTC (queried 2026-09-30; an earlier draft said "by
-- 2026-10-17", which was a rounded estimate). That is the table's last row;
-- the last credit a reader can actually SEE (a credit whose exact photo the
-- app holds) expires earlier, 2026-10-03 15:01 UTC. Two
-- reasons to delete rather than keep hiding:
--   1. Storage. Hidden rows still cost disk, index and vacuum work forever.
--   2. Google's Places terms. Photo credits are Places content; expires_at is
--      the lifetime of the response they came from (max 30 days). Keeping
--      them past that is keeping Google content past its cache window.
--
-- WHAT IS DELETED. Only rows with expires_at < now() - p_grace, p_grace at
-- least 1 hour. Nothing else is ever touched: no other table, no live row.
--
-- WHY IT CANNOT WIPE ACTIVE CREDITS. Four independent locks, any one enough:
--   a. The only DELETE matches expires_at < cutoff, and cutoff is always at
--      least 1 hour in the past (p_grace below 1 hour is refused).
--   b. The DELETE re-checks expires_at on the locked row, so a credit that a
--      concurrent paid response refreshed (upsert) survives.
--   c. Every deleted row's expires_at is returned and checked: if the newest
--      one is not before the cutoff, the batch is undone.
--   d. Live rows (expires_at > now()) are counted before and after. If the
--      count fell, the batch is undone. now() is fixed for the transaction,
--      so both counts use the same definition of "live".
-- A refused batch rolls back completely (subtransaction) and is recorded in
-- wf_job_pulse as attempted=1, succeeded=0, failed=1, which job-watch pages
-- on. The DELETE runs at most p_max_rows (1..20000) rows per call.
--
-- SCHEDULE. Hourly at :23, 5,000 rows per run. The 2026-09-29 backlog
-- (54,224) clears in about 11 runs; after that each run deletes whatever
-- expired in the last hour, usually nothing.
--
-- DISK. DELETE makes the space reusable by the table, it does not return it
-- to the operating system. Shrinking the file needs a one-time
-- `vacuum (full) public.wf_photo_credit;` after the backlog clears. That takes
-- a brief exclusive lock (readers fail closed and show today's fallback), so
-- it is an owner decision and deliberately NOT part of this migration.
--
-- IMPACT: adds one index, one function, one pg_cron job, and updates the
-- table comment. No existing row, column, policy or grant changes.
-- ROLLBACK:
--   select cron.unschedule('wf-photo-credit-purge');
--   drop function if exists public.wf_photo_credit_purge_expired(integer, interval);
--   drop index if exists public.wf_photo_credit_expires_idx;
-- Rows already deleted were expired and invisible to every reader; the next
-- paid Places response for a place writes its credits again.

-- Lets each batch find the oldest expired rows without scanning the table.
create index if not exists wf_photo_credit_expires_idx
  on public.wf_photo_credit (expires_at);

create or replace function public.wf_photo_credit_purge_expired(
  p_max_rows integer default 5000,
  p_grace interval default interval '1 hour'
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_cutoff timestamptz;
  v_live_before bigint;
  v_live_after bigint;
  v_deleted integer := 0;
  v_newest_deleted timestamptz;
begin
  if p_max_rows is null or p_max_rows < 1 or p_max_rows > 20000 then
    raise exception 'wf_photo_credit_purge_expired: p_max_rows must be 1..20000 (got %)', p_max_rows;
  end if;
  if p_grace is null or p_grace < interval '1 hour' then
    raise exception 'wf_photo_credit_purge_expired: p_grace must be at least 1 hour (got %)', p_grace;
  end if;

  -- now() is the transaction start time, so it cannot move between the two
  -- live counts below.
  v_cutoff := now() - p_grace;

  begin
    select count(*) into v_live_before
      from public.wf_photo_credit where expires_at > now();

    with doomed as (
      select photo_name
        from public.wf_photo_credit
       where expires_at < v_cutoff
       order by expires_at
       limit p_max_rows
       for update skip locked
    ), gone as (
      delete from public.wf_photo_credit c
       using doomed d
       where c.photo_name = d.photo_name
         and c.expires_at < v_cutoff
      returning c.expires_at
    )
    select count(*), max(expires_at) into v_deleted, v_newest_deleted from gone;

    if v_deleted > 0 and not (v_newest_deleted < v_cutoff) then
      raise exception 'refused: a deleted row expires at %, not before the cutoff %', v_newest_deleted, v_cutoff;
    end if;

    select count(*) into v_live_after
      from public.wf_photo_credit where expires_at > now();
    if v_live_after < v_live_before then
      raise exception 'refused: live credits would fall from % to %', v_live_before, v_live_after;
    end if;
  exception when others then
    -- Everything in this block is rolled back. Record the refusal so it pages.
    insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
    values ('photo-credit-purge', 1, 0, 1, left('purge undone, nothing deleted: ' || sqlerrm, 300));
    return 0;
  end;

  insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
  values ('photo-credit-purge', v_deleted, v_deleted, 0,
          format('deleted %s expired credit rows (expired before %s); %s live rows kept',
                 v_deleted, v_cutoff, v_live_after));
  return v_deleted;
end;
$function$;

revoke all on function public.wf_photo_credit_purge_expired(integer, interval) from public, anon, authenticated;
grant execute on function public.wf_photo_credit_purge_expired(integer, interval) to service_role, postgres;

select cron.schedule('wf-photo-credit-purge', '23 * * * *',
  $$select public.wf_photo_credit_purge_expired(5000, interval '1 hour')$$);

comment on table public.wf_photo_credit is
  'Google Places photo author credits Wayfind already received (search/details responses), keyed by photo resource name. Written only by lib/photoCredits.js (service_role); never triggers a Google request. Rows past expires_at (<= 30 days, Google cache limit) are hidden by RLS and deleted within about 2 hours by wf_photo_credit_purge_expired (pg_cron wf-photo-credit-purge, hourly). Read by blog.gowayfind.com and Wayfind guides to credit each photo. Added 2026-09-23; purge added 2026-09-30.';

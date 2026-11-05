-- Follow-up to #2245: a due held event cannot be explicitly renewed beyond ET today+2.
-- 20261105120000 protects NULL writes and existing future milestones. Its old-deadline
-- test left a gap: recheck_on=today -> today+30 was accepted on a PARTIAL check.
-- Bound only UPDATE renewals whose OLD deadline is absent/due; preserve intentional
-- still-future deadlines (including the Noah Kahan presale check) and earlier proposals.
-- No row rewrite, trigger/grant/RLS change, or effect on past/undated/displayable rows.
-- Require the preceding guard migration rather than creating an unattached helper.
do $precondition$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.wf_events'::regclass
       and tgname = 'wf_events_held_recheck_guard'
       and not tgisinternal and tgenabled in ('O', 'A')
       and tgfoid = to_regprocedure('public.wf_events_held_recheck_guard()')
  ) then
    raise exception 'apply 20261105120000_event_truth_held_recheck_guard.sql first: enabled held recheck trigger required';
  end if;
end
$precondition$;

create or replace function public.wf_events_held_recheck_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if new.event_status in ('postponed', 'uncertain', 'unannounced')
     and new.start_date is not null and new.start_date >= v_today then
    if tg_op = 'UPDATE' and old.recheck_on is not null and old.recheck_on > v_today
       and (new.recheck_on is null or new.recheck_on > old.recheck_on) then
      new.recheck_on := old.recheck_on;
      new.recheck_reason := old.recheck_reason;
      new.recheck_set_at := old.recheck_set_at;
    elsif new.recheck_on is null
       or (tg_op = 'UPDATE' and (old.recheck_on is null or old.recheck_on <= v_today)
           and new.recheck_on > v_today + 2) then
      new.recheck_on := v_today + 2;
      new.recheck_reason := 'auto: held row renewal bounded to two days (guard ' || to_char(v_today, 'YYYY-MM-DD')
        || '); look for the official listing, and if it is still unavailable keep the status';
      new.recheck_set_at := now();
    end if;
  end if;
  return new;
end
$fn$;

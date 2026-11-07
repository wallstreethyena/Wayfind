-- Event truth: a held event can never lose its next check, and an earlier valid check date is
-- never pushed later. Complements 20261104150000_event_truth_held_recheck_floor.sql.
--
-- WHY (owner, 2026-11-05): "Verify that partial confirmation cannot leave a held event without
-- a recheck within two days. Preserve any earlier valid deadline so repeated partial checks
-- cannot continually postpone verification."
-- The daily event truth task's apply step clears recheck_on when it has arrived, on PASS and on
-- PARTIAL. The 20261104150000 floor re-adds one only at the next 10:41 UTC integrity run, so a
-- cleared held row could wait up to three days. This trigger closes the gap at write time:
--   * a postponed / uncertain / unannounced row whose start_date is today or later, written
--     with no recheck_on, gets recheck_on = today (ET) + 2 in the same statement;
--   * if such a row already holds a recheck_on that is still in the future, an update can
--     move it EARLIER but never later (and never clear it): the earlier deadline stands.
-- Rows changing to a displayable status, past events and undated held rows are untouched.
-- Dates are ET (America/New_York), the same calendar the queue uses.
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
    elsif new.recheck_on is null then
      new.recheck_on := v_today + 2;
      new.recheck_reason := 'auto: held row written without a next check (guard ' || to_char(v_today, 'YYYY-MM-DD')
        || '); look for the official listing, and if it is still unavailable keep the status';
      new.recheck_set_at := now();
    end if;
  end if;
  return new;
end
$fn$;

revoke all on function public.wf_events_held_recheck_guard() from public, anon, authenticated;

drop trigger if exists wf_events_held_recheck_guard on public.wf_events;
create trigger wf_events_held_recheck_guard
  before insert or update of recheck_on, event_status, start_date on public.wf_events
  for each row execute function public.wf_events_held_recheck_guard();

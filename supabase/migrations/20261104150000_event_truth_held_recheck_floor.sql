-- Event truth: a held row with a known future date always has its next check scheduled.
--
-- WHY (owner, 2026-11-04): "Confirm the daily task actually consumes its recheck field and
-- that its instructions preserve the next required check if an official event listing is
-- still unavailable. A date in a row is insufficient evidence of a working follow-up."
-- The daily task's queue (wf_event_truth_queue class 5) does consume recheck_on for
-- postponed / uncertain / unannounced rows. But its apply step clears a recheck_on that has
-- arrived on any PASS or PARTIAL row, and only the prompt's prose asks the run to set the
-- next one. A held row (e.g. noah-kahan-last-of-the-bugs-tampa-2027, unannounced, Apr 29
-- 2027, no Ticketmaster event page yet) that comes back PARTIAL would then carry no
-- recheck_on, so no queue class would ever select it again and it would sit hidden until
-- the monthly hidden-events watch. wf_event_truth_integrity only scanned displayable rows,
-- so nothing would notice.
--
-- This adds a deterministic floor, applied by the existing 10:41 UTC pg_cron job
-- (wf-event-truth-integrity, before the 08:07 ET task):
--   * wf_event_truth_integrity reports 'held_without_recheck': a postponed / uncertain /
--     unannounced row with a start_date today or later and no recheck_on.
--   * wf_event_truth_integrity_enforce sets recheck_on = today + 2 on those rows (reason and
--     recheck_set_at recorded), so the next check is at most three days after a cleared one.
--     It never touches a row that already has a recheck_on, never changes status or dates,
--     and leaves undated held rows (no start_date) to the monthly hidden-events watch.
-- Both functions are patched in place from their live definitions, asserting each anchor
-- exists exactly once, so nothing else in them changes.
do $mig$
declare d text; n int;
begin
  d := pg_get_functiondef('public.wf_event_truth_integrity'::regproc);
  if position('held_without_recheck' in d) = 0 then
    n := (length(d) - length(replace(d, '  union all select ''duplicate_name_date''', ''))) / length('  union all select ''duplicate_name_date''');
    if n <> 1 then raise exception 'integrity anchor found % times', n; end if;
    d := replace(d, '  union all select ''duplicate_name_date''',
      '  union all select ''held_without_recheck'', h.event_id from wf_events h, today' || chr(10) ||
      '     where h.event_status in (''postponed'',''uncertain'',''unannounced'') and h.recheck_on is null and h.start_date >= today.d' || chr(10) ||
      '  union all select ''duplicate_name_date''');
    execute d;
  end if;

  d := pg_get_functiondef('public.wf_event_truth_integrity_enforce'::regproc);
  if position('held_without_recheck' in d) = 0 then
    if (length(d) - length(replace(d, 'v_tz int := 0; v_re int := 0;', ''))) / length('v_tz int := 0; v_re int := 0;') <> 1 then raise exception 'enforce declare anchor'; end if;
    if (length(d) - length(replace(d, '  return jsonb_build_object(''at'', now(), ''timezone_fixed'', v_tz, ''rechecks_scheduled'', v_re, ''scan'', r->''counts'');', ''))) <> length('  return jsonb_build_object(''at'', now(), ''timezone_fixed'', v_tz, ''rechecks_scheduled'', v_re, ''scan'', r->''counts'');') then raise exception 'enforce return anchor'; end if;
    d := replace(d, 'v_tz int := 0; v_re int := 0;', 'v_tz int := 0; v_re int := 0; v_held int := 0;');
    d := replace(d, '  return jsonb_build_object(''at'', now(), ''timezone_fixed'', v_tz, ''rechecks_scheduled'', v_re, ''scan'', r->''counts'');',
      '  -- (c) held rows with a known future date always carry their next check (2026-11-04).' || chr(10) ||
      '  with held as (' || chr(10) ||
      '    update wf_events w set recheck_on = v_today + 2,' || chr(10) ||
      '           recheck_reason = ''integrity: held_without_recheck (auto-scheduled '' || to_char(v_today,''YYYY-MM-DD'') || ''): look for the official listing; if still unavailable keep the status and set the next recheck_on''' || chr(10) ||
      '           , recheck_set_at = now()' || chr(10) ||
      '     where w.event_id in (select jsonb_array_elements_text(coalesce(r->''ids''->''held_without_recheck'',''[]''::jsonb)))' || chr(10) ||
      '       and w.recheck_on is null and w.event_status in (''postponed'',''uncertain'',''unannounced'') and w.start_date >= v_today' || chr(10) ||
      '    returning 1)' || chr(10) ||
      '  select count(*) into v_held from held;' || chr(10) || chr(10) ||
      '  return jsonb_build_object(''at'', now(), ''timezone_fixed'', v_tz, ''rechecks_scheduled'', v_re + v_held, ''held_rechecks_scheduled'', v_held, ''scan'', r->''counts'');');
    execute d;
  end if;
end $mig$;

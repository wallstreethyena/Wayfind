create or replace function public.wf_carousel_sync_run()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_err int; v_warn int; v_items int; v_open int; v_sum jsonb; v_note text;
begin
  update wf_carousels c set
    sync_state = case
      when not exists (select 1 from wf_carousel_items i where i.carousel_key = c.carousel_key) then 'pending'
      when exists (select 1 from wf_carousel_guard() g where g.carousel_key = c.carousel_key and g.severity = 'error' and g.check_name <> 'false_success') then 'blocked'
      when exists (select 1 from wf_carousel_items i where i.carousel_key = c.carousel_key
                   and (i.match_state in ('pending','pending_evidence') or i.trending_state in ('unknown','needs_code'))) then 'pending'
      else 'synced' end,
    sync_note = (select string_agg(distinct i.match_state||'/'||i.trending_state, ', ') from wf_carousel_items i where i.carousel_key = c.carousel_key
                 and (i.match_state in ('pending','pending_evidence') or i.trending_state in ('unknown','needs_code','blocked'))),
    sync_checked_at = now(), updated_at = now();
  select count(*) filter (where severity='error'), count(*) filter (where severity='warn') into v_err, v_warn from wf_carousel_guard();
  select count(*), count(*) filter (where match_state in ('pending','pending_evidence') or trending_state in ('needs_code','unknown')) into v_items, v_open from wf_carousel_items;
  select jsonb_object_agg(check_name, n) into v_sum from (select check_name, count(*) n from wf_carousel_guard() group by 1) s;
  v_note := case when v_err = 0 then 'clean: ' else 'RED: ' end || v_err || ' error, ' || v_warn || ' warn | items ' || v_items || ' open ' || v_open
            || ' | carousels synced ' || (select count(*) from wf_carousels where sync_state='synced') || '/' || (select count(*) from wf_carousels)
            || ' | ' || coalesce(v_sum::text,'{}');
  insert into wf_job_pulse(job, attempted, succeeded, failed, note) values ('carousel-sync', 1, case when v_err=0 then 1 else 0 end, case when v_err=0 then 0 else 1 end, left(v_note, 480));
  return jsonb_build_object('errors', v_err, 'warns', v_warn, 'items', v_items, 'open', v_open, 'by_check', coalesce(v_sum,'{}'::jsonb));
end $$;
revoke all on function public.wf_carousel_sync_run() from public, anon, authenticated;
-- the guard must also fail a "synced" carousel that still has a needs_code / pending_evidence item
create or replace function public.wf_carousel_false_success_ok() returns boolean language sql stable set search_path=public as $$
  select not exists (select 1 from wf_carousels c join wf_carousel_items i using (carousel_key)
                     where c.sync_state='synced' and (i.match_state in ('pending','pending_evidence') or i.trending_state in ('unknown','needs_code')));
$$;
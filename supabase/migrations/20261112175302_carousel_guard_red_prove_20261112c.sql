do $$
declare got text[]; base int; missing text := ''; pre text;
begin
  select string_agg(distinct check_name, ',') into pre from public.wf_carousel_guard() where severity='error';
  perform public.wf_carousel_sync_run();
  select count(*) into base from public.wf_carousel_guard() where severity='error';
  if base <> 0 then raise exception 'baseline not clean after recompute: % errors (pre: %)', base, pre; end if;
  begin
    update wf_events set start_date='2026-11-01', end_date='2026-11-02' where event_id='floridarama-fest-2026';
    update wf_events set tags = array_remove(tags,'wf-trending') where event_id='st-pete-run-fest-2026';
    update wf_events set link_ok=false where event_id='miracle-on-orange-2026';
    update wf_carousels set sync_state='synced' where carousel_key='2026-11-10-rush-night-out';
    insert into wf_carousel_items(carousel_key,item_key,name,kind) values ('2026-11-10-rush-night-out','redprove-unresolved','Red prove','restaurant');
    update wf_carousel_items set place_id='ChIJ_not_a_real_place' where carousel_key='2026-11-10-rush-night-out' and item_key='naked-farmer';
    insert into wf_events select (jsonb_populate_record(null::wf_events, to_jsonb(e) || '{"event_id":"st-pete-run-fest-2026-dup","slug":"st-pete-run-fest-2026-dup"}'::jsonb)).* from wf_events e where e.event_id='st-pete-run-fest-2026';
    select array_agg(distinct check_name) into got from public.wf_carousel_guard() where severity='error';
    if not got @> array['expired_displayed'] then missing := missing||' expired_displayed'; end if;
    if not got @> array['trending_missing'] then missing := missing||' trending_missing'; end if;
    if not got @> array['link_broken'] then missing := missing||' link_broken'; end if;
    if not got @> array['false_success'] then missing := missing||' false_success'; end if;
    if not got @> array['dangling_place'] then missing := missing||' dangling_place'; end if;
    if not got @> array['duplicate_canonical'] then missing := missing||' duplicate_canonical'; end if;
    if (public.wf_carousel_sync_run()->>'errors')::int = 0 then missing := missing||' runner_stayed_green'; end if;
    raise exception 'ROLLBACK_REDPROVE';
  exception when others then
    if sqlerrm <> 'ROLLBACK_REDPROVE' then raise; end if;
  end;
  if missing <> '' then raise exception 'red-prove FAILED, guard did not fire for:%', missing; end if;
  select count(*) into base from public.wf_carousel_guard() where severity='error';
  if base <> 0 then raise exception 'rollback leaked: % errors', base; end if;
  perform public.wf_carousel_sync_run();
  insert into wf_job_pulse(job,attempted,succeeded,failed,note) values ('carousel-sync-redprove',7,7,0,'red-prove 2026-11-12: pre-recompute guard caught real false_success ('||coalesce(pre,'none')||'); then fired for expired_displayed, trending_missing, link_broken, false_success, dangling_place, duplicate_canonical; runner went red; rolled back; baseline clean');
end $$;
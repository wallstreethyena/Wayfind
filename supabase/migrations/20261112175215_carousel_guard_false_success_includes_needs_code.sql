do $$ declare d text; begin
 d := pg_get_functiondef('public.wf_carousel_guard'::regproc);
 if position($s$(it.match_state = 'pending' or it.trending_state = 'unknown')$s$ in d) > 0 then
   d := replace(d, $s$(it.match_state = 'pending' or it.trending_state = 'unknown')$s$, $s$(it.match_state in ('pending','pending_evidence') or it.trending_state in ('unknown','needs_code'))$s$);
   execute d;
 end if;
 if position($s$trending_state in ('unknown','needs_code'))$s$ in pg_get_functiondef('public.wf_carousel_guard'::regproc)) = 0 then
   raise exception 'false_success clause not upgraded';
 end if;
end $$;
revoke all on function public.wf_carousel_guard() from public, anon, authenticated;
select cron.schedule('wf-carousel-sync', '17 * * * *', $c$select public.wf_carousel_sync_run()$c$);
insert into public.wf_heartbeat_expected(job, max_staleness_minutes, note)
select 'carousel-sync', 180, 'Carousel -> Wayfind inventory reconciliation guard (wf_carousel_sync_run, hourly :17). Red pulse = a featured experience is missing, expired-but-displayed, untagged for Trending, has a broken link, or a carousel claims synced while unresolved.'
where not exists (select 1 from public.wf_heartbeat_expected where job='carousel-sync');
insert into wf_carousel_items(carousel_key,item_key,name,kind,match_state,blocker,trending_state,image_state,evidence)
values ('2026-10-posted-14-florida-haunts-DfBS7V0DNYK','unread-remaining-9','9 of 14 featured haunts not readable','event','pending_evidence',
 'Post instagram.com/p/DfBS7V0DNYK not fetchable and slide files not found in Drive; only 5 names known from the ads playbook. Season ended Nov 1, so any missing rows would be expired_not_created; recorded so the carousel never reads synced on partial evidence.',
 'blocked','not_applicable','carousel manifest 2026-11-12')
on conflict (carousel_key,item_key) do nothing;
do $$ declare r jsonb; begin
  r := public.wf_carousel_sync_run();
  if (r->>'errors')::int <> 0 then raise exception 'carousel guard has errors: %', r; end if;
  if (select count(*) from wf_carousels where sync_state='synced') <> 7 then raise exception 'expected 7 synced carousels, got % (%)', (select count(*) from wf_carousels where sync_state='synced'), (select string_agg(carousel_key||'='||sync_state, ', ') from wf_carousels); end if;
end $$;
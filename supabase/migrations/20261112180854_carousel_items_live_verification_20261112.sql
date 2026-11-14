update wf_carousel_items set trending_state='needs_code',
  blocker='DB row correct and tagged trend-parties, but static research entry data/christmas-2026-research.json (miracle-on-orange-2026, state confirmed_season_undated) overrides it: live page says "dates not announced" and /api/events drops it. Fix: branch fix/miracle-on-orange-2026-dated (patch delivered 2026-11-12).',
  prod_verified_at=now(), prod_evidence='2026-11-12 18:1xZ live: /florida-events/miracle-on-orange-2026 200 but "2026 season confirmed, dates not announced yet"; absent from Winter Park Trending shelves'
 where event_id='miracle-on-orange-2026';
update wf_carousel_items set prod_verified_at=now(), prod_evidence = case event_id
  when 'st-pete-run-fest-2026' then '2026-11-12 live 390px St. Petersburg: in Trending Festivals shelf; event page 200 "Nov 13–15, 2026", venue photo credited'
  when 'floridarama-fest-2026' then '2026-11-12 live 390px St. Petersburg: in Trending Festivals shelf; event page 200'
  when 'christmas-town-2026' then '2026-11-12 live 390px St. Petersburg: in Trending Everything Else shelf with Undercover Tourist ticket button'
  when 'stetson-mansion-christmas-2026' then '2026-11-12 live 390px DeLand: in Trending Everything Else shelf; event page 200 merges existing research card stetson-mansion-christmas-2026-2 (no duplicate), credited gallery'
  when 'christmas-at-gaylord-palms-2026' then '2026-11-12 live 390px Kissimmee: in Trending Everything Else shelf'
  when 'nights-of-lights-2026' then '2026-11-12 live 390px St. Augustine: in Trending Everything Else shelf'
  when 'crystal-classic-2026' then '2026-11-12 live 390px Sarasota: in Trending Festivals shelf'
  when 'sarasota-medieval-fair-2026' then '2026-11-12 live 390px Sarasota: in Trending Festivals shelf'
  else prod_evidence end
 where event_id in ('st-pete-run-fest-2026','floridarama-fest-2026','christmas-town-2026','stetson-mansion-christmas-2026','christmas-at-gaylord-palms-2026','nights-of-lights-2026','crystal-classic-2026','sarasota-medieval-fair-2026');
update wf_carousel_items set image_state='owned', image_credit='ABC Action News Tampa Bay (existing Christmas gallery credit)' where event_id='stetson-mansion-christmas-2026';
update wf_carousel_items set image_state='venue_photo' where event_id in ('st-pete-run-fest-2026','miracle-on-orange-2026','christmas-town-2026','christmas-at-gaylord-palms-2026','crystal-classic-2026','sarasota-medieval-fair-2026','nights-of-lights-2026');
update wf_carousel_items set image_state='scene_fallback' where event_id in ('floridarama-fest-2026','hillsborough-county-fair-2026','selby-lights-in-bloom-2026');
update wf_events set official_ticket_url='https://raceroster.com/events/2026/113330/st-pete-run-fest' where event_id='st-pete-run-fest-2026' and official_ticket_url is null;
select public.wf_carousel_sync_run();
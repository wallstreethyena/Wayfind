alter table public.wf_events
  add column if not exists link_manual_verifications jsonb not null default '{}'::jsonb;

comment on column public.wf_events.link_manual_verifications is
  'Exact URL -> short-lived manual browser verification metadata. Used only to bridge bot walls/false content classifiers; entries expire and automated probing resumes.';

update public.wf_events set
  official_event_url='https://disneyworld.disney.go.com/events-tours/epcot/epcot-international-food-and-wine-festival/',
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url='https://disneyworld.disney.go.com/events-tours/epcot/epcot-international-food-and-wine-festival/',
  link_manual_verifications=jsonb_build_object(
    'https://disneyworld.disney.go.com/events-tours/epcot/epcot-international-food-and-wine-festival/',
    jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Disney event page')
  )
where event_id='epcot-food-wine-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_ticket_url,
  link_manual_verifications=jsonb_build_object(
    official_ticket_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-09-28','evidence','organizer page current ticket link'),
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Brevard Zoo event page')
  )
where event_id='beware-the-night-brevard-zoo-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_ticket_url,
  link_manual_verifications=jsonb_build_object(
    official_ticket_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-09-24','evidence','exact 2026 event listing + provider bot wall')
  )
where event_id='great-chicken-nugget-crawl-fort-myers-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_event_url,
  link_manual_verifications=jsonb_build_object(
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Manatee County event page')
  )
where event_id='goblin-gathering-bradenton-2026';

update public.wf_events set
  start_date='2026-11-18', end_date='2026-11-22',
  official_event_url='https://keywestff.com/',
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url='https://keywestff.com/',
  link_manual_verifications=jsonb_build_object(
    'https://keywestff.com/', jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current 2026 festival site')
  )
where event_id='key-west-film-festival-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_event_url,
  link_manual_verifications=jsonb_build_object(
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Disney 2026 event page')
  )
where event_id='mnsshp-2026';

update public.wf_events set
  official_event_url='https://disneyparksblog.com/wdw/jock-lindseys-halloween-hangar-bar-frightful-first-look/',
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url='https://disneyparksblog.com/wdw/jock-lindseys-halloween-hangar-bar-frightful-first-look/',
  link_manual_verifications=jsonb_build_object(
    'https://disneyparksblog.com/wdw/jock-lindseys-halloween-hangar-bar-frightful-first-look/',
    jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Disney Parks Blog event-specific page')
  )
where event_id='jock-lindseys-halloween-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=coalesce(official_ticket_url,official_event_url),
  link_manual_verifications=jsonb_build_object(
    coalesce(official_ticket_url,official_event_url),
    jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current official Magical Dining site')
  )
where event_id='magical-dining-2026';

update public.wf_events set
  official_event_url='https://business.plantcity.org/events/details/oktoberfest-downtown-plant-city-18334?calendarMonth=2026-09-01',
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url='https://business.plantcity.org/events/details/oktoberfest-downtown-plant-city-18334?calendarMonth=2026-09-01',
  link_manual_verifications=jsonb_build_object(
    'https://business.plantcity.org/events/details/oktoberfest-downtown-plant-city-18334?calendarMonth=2026-09-01',
    jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Plant City chamber event page')
  )
where event_id='plant-city-oktoberfest-2026';

update public.wf_events set
  official_event_url='https://www.visitstpeteclearwater.com/event/st-pete-night-market/60331',
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url='https://www.visitstpeteclearwater.com/event/st-pete-night-market/60331',
  link_manual_verifications=jsonb_build_object(
    'https://www.visitstpeteclearwater.com/event/st-pete-night-market/60331',
    jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Visit St Pete recurring event page')
  )
where event_id in ('st-pete-night-market-2026-10','st-pete-night-market-2026-11','st-pete-night-market-2026-12');

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_ticket_url,
  link_manual_verifications=jsonb_build_object(
    official_ticket_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-09-28','evidence','current Fever listing')
  )
where event_id in ('candlelight-haunted-orlando-2026','candlelight-halloween-siesta-key-2026');

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_event_url,
  link_manual_verifications=jsonb_build_object(
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current organizer event page')
  )
where event_id='halloween-on-central-st-pete-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_event_url,
  link_manual_verifications=jsonb_build_object(
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Visit Orlando event page')
  )
where event_id='thriller-halloween-bar-crawl-pointe-orlando-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_ticket_url,
  link_manual_verifications=jsonb_build_object(
    official_ticket_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-09-28','evidence','current Disney purchase page')
  )
where event_id='jollywood-nights-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_ticket_url,
  link_manual_verifications=jsonb_build_object(
    official_ticket_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-09-28','evidence','current Disney purchase page'),
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Disney event page')
  )
where event_id='mvmcp-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_event_url,
  link_manual_verifications=jsonb_build_object(
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-05','evidence','current Disney holiday festival page')
  )
where event_id='epcot-festival-holidays-2026';

update public.wf_events set
  link_ok=true, link_verdict='manual:alive', link_checked_at=now(),
  link_final_url=official_event_url,
  link_manual_verifications=jsonb_build_object(
    official_event_url, jsonb_build_object('reviewed_at','2026-09-21','review_by','2026-10-21','evidence','current Florida State Parks festival page')
  )
where event_id='florida-folk-2027';

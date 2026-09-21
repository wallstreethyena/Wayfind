-- Production-applied 2026-09-21. Exact event-ticket products only.
-- Unknown link health is intentional until the normal affiliate verifier runs.
insert into public.wf_deals
  (provider,title,subtitle,category,subcategory,image_url,gradient,discount_text,badge,
   dest_url,affiliate_url,maps_to,starts_at,ends_at,active,last_checked_at,link_ok,http_status,
   quality10,fail_count,photo_ref,scope)
select
  'undercover_tourist',
  'Mickey''s Very Merry Christmas Party — Event Ticket',
  'Magic Kingdom''s own separately ticketed holiday party, select nights Nov 8 – Dec 22',
  'attractions','seasonal_events',null,
  coalesce(src.gradient,'radial-gradient(120% 120% at 50% 20%,#ff8038,#8a2f6a 60%,#2a1633)'),
  'Event tickets','Seasonal',
  'https://www.undercovertourist.com/orlando/mickeys-very-merry-christmas-party-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_mvmcp/https://www.undercovertourist.com/orlando/mickeys-very-merry-christmas-party-ticket/',
  'magic kingdom',null,'2026-12-23T05:00:00+00:00',true,null,null,null,
  null,0,src.photo_ref,'local'
from (select gradient,photo_ref from public.wf_deals where id=8 limit 1) src
where not exists (
  select 1 from public.wf_deals
  where provider='undercover_tourist'
    and dest_url='https://www.undercovertourist.com/orlando/mickeys-very-merry-christmas-party-ticket/'
);

insert into public.wf_deals
  (provider,title,subtitle,category,subcategory,image_url,gradient,discount_text,badge,
   dest_url,affiliate_url,maps_to,starts_at,ends_at,active,last_checked_at,link_ok,http_status,
   quality10,fail_count,photo_ref,scope)
select
  'undercover_tourist',
  'Disney Jollywood Nights — Event Ticket',
  'Disney''s Hollywood Studios separately ticketed holiday party, select nights Nov 7 – Jan 5',
  'attractions','seasonal_events',null,
  coalesce(src.gradient,'radial-gradient(120% 120% at 50% 20%,#ff8038,#8a2f6a 60%,#2a1633)'),
  'Event tickets','Seasonal',
  'https://www.undercovertourist.com/orlando/disney-jollywood-nights-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_jollywood/https://www.undercovertourist.com/orlando/disney-jollywood-nights-ticket/',
  'disney hollywood studios',null,'2027-01-06T05:30:00+00:00',true,null,null,null,
  null,0,src.photo_ref,'local'
from (select gradient,photo_ref from public.wf_deals where id=8 limit 1) src
where not exists (
  select 1 from public.wf_deals
  where provider='undercover_tourist'
    and dest_url='https://www.undercovertourist.com/orlando/disney-jollywood-nights-ticket/'
);

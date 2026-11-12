-- Exact one-day Undercover Tourist product pages for the four parks whose
-- Christmas events are included with admission. Confirmed live 2026-11-09:
--   EPCOT        https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/
--   SeaWorld     https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/
--   Busch Gardens https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-any-day-ticket/
--   LEGOLAND     https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/
-- The resort landing rows (5, 7, 15, 16) stay. These inserts do not retarget
-- them. Idempotent on provider + dest_url. link_ok stays unknown until the
-- affiliate verifier runs. id is generated, so the event map pins the ids
-- read back after insert.

insert into public.wf_deals
  (provider,title,subtitle,category,subcategory,image_url,gradient,discount_text,badge,
   dest_url,affiliate_url,maps_to,starts_at,ends_at,active,last_checked_at,link_ok,http_status,
   quality10,fail_count,photo_ref,scope)
select
  'undercover_tourist',
  '1-Day EPCOT Theme Park Base Ticket',
  'One-day base admission to EPCOT',
  src.category, src.subcategory, null,
  src.gradient, src.discount_text, src.badge,
  'https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_epcot_1day/https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/',
  'epcot', null, null, true, null, null, null,
  null, 0, src.photo_ref, src.scope
from (select category, subcategory, gradient, discount_text, badge, photo_ref, scope from public.wf_deals where id = 5) src
where not exists (
  select 1 from public.wf_deals
  where provider = 'undercover_tourist'
    and dest_url = 'https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/'
);

insert into public.wf_deals
  (provider,title,subtitle,category,subcategory,image_url,gradient,discount_text,badge,
   dest_url,affiliate_url,maps_to,starts_at,ends_at,active,last_checked_at,link_ok,http_status,
   quality10,fail_count,photo_ref,scope)
select
  'undercover_tourist',
  'SeaWorld Orlando Single Day Ticket',
  'One-day admission to SeaWorld Orlando',
  src.category, src.subcategory, null,
  src.gradient, src.discount_text, src.badge,
  'https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_seaworld_1day/https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/',
  'seaworld orlando', null, null, true, null, null, null,
  null, 0, src.photo_ref, src.scope
from (select category, subcategory, gradient, discount_text, badge, photo_ref, scope from public.wf_deals where id = 7) src
where not exists (
  select 1 from public.wf_deals
  where provider = 'undercover_tourist'
    and dest_url = 'https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/'
);

insert into public.wf_deals
  (provider,title,subtitle,category,subcategory,image_url,gradient,discount_text,badge,
   dest_url,affiliate_url,maps_to,starts_at,ends_at,active,last_checked_at,link_ok,http_status,
   quality10,fail_count,photo_ref,scope)
select
  'undercover_tourist',
  'Busch Gardens Tampa Single Day Ticket',
  'One visit to Busch Gardens Tampa Bay',
  src.category, src.subcategory, null,
  src.gradient, src.discount_text, src.badge,
  'https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-any-day-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_busch_1day/https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-any-day-ticket/',
  'busch gardens tampa bay', null, null, true, null, null, null,
  null, 0, src.photo_ref, src.scope
from (select category, subcategory, gradient, discount_text, badge, photo_ref, scope from public.wf_deals where id = 15) src
where not exists (
  select 1 from public.wf_deals
  where provider = 'undercover_tourist'
    and dest_url = 'https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-any-day-ticket/'
);

insert into public.wf_deals
  (provider,title,subtitle,category,subcategory,image_url,gradient,discount_text,badge,
   dest_url,affiliate_url,maps_to,starts_at,ends_at,active,last_checked_at,link_ok,http_status,
   quality10,fail_count,photo_ref,scope)
select
  'undercover_tourist',
  '1-Day LEGOLAND Florida Ticket',
  'One-day admission to LEGOLAND Florida Resort, with same-day SEA LIFE Florida entry',
  src.category, src.subcategory, null,
  src.gradient, src.discount_text, src.badge,
  'https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_legoland_1day/https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/',
  'legoland florida', null, null, true, null, null, null,
  null, 0, src.photo_ref, src.scope
from (select category, subcategory, gradient, discount_text, badge, photo_ref, scope from public.wf_deals where id = 16) src
where not exists (
  select 1 from public.wf_deals
  where provider = 'undercover_tourist'
    and dest_url = 'https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/'
);

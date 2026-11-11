-- Christmas park cards sell the exact one-day Undercover Tourist product page.
-- Rows 5, 7, 15 and 16 stay the park hub pages for every other surface.
--
-- Column check against those four rows on 2026-11-09, before this insert:
--   category     attractions     (the proposal's "tickets" does not match)
--   subcategory  theme_parks
--   scope        local           (the proposal's "regional" does not match)
--   active       true
--   fail_count   0               (not null; deals-health reads it)
--   link_ok      null            (unknown is servable; only false is dead)
--   gradient, discount_text, badge, photo_ref, maps_to copied from the hub
-- The affiliate_url is the CJ dlg raw path with PID 101643573. The sid is the
-- one in the approved product-row SQL. quality10 stays null: the hub scores
-- were measured, not copied onto a new product.

insert into public.wf_deals
  (provider, title, category, subcategory, gradient, discount_text, badge,
   dest_url, affiliate_url, maps_to, active, fail_count, photo_ref, scope)
select
  'undercover_tourist',
  v.title,
  src.category,
  src.subcategory,
  src.gradient,
  src.discount_text,
  src.badge,
  v.dest_url,
  v.affiliate_url,
  src.maps_to,
  true,
  0,
  src.photo_ref,
  src.scope
from (values
  (5::bigint,
   '1-Day EPCOT Theme Park Base Ticket',
   'https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_epcot1/https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/'),
  (7::bigint,
   'SeaWorld Orlando Single Day Ticket',
   'https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_sea1/https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/'),
  (15::bigint,
   'Busch Gardens Tampa Single Day Ticket',
   'https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_bgt1/https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-ticket/'),
  (16::bigint,
   '1-Day LEGOLAND Florida Ticket',
   'https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_lego1/https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/')
) as v(hub_id, title, dest_url, affiliate_url)
join public.wf_deals src on src.id = v.hub_id
where not exists (
  select 1 from public.wf_deals existing
  where existing.provider = 'undercover_tourist'
    and existing.dest_url = v.dest_url
);

-- Align a product row that already has the official destination (an earlier
-- insert used a different sid, and EPCOT's maps_to was not the hub's).
-- The hub ids are excluded by the destination, which is not their dest_url.
update public.wf_deals as product
set affiliate_url = v.affiliate_url,
    maps_to = src.maps_to,
    category = src.category,
    subcategory = src.subcategory,
    scope = src.scope,
    active = true,
    fail_count = coalesce(product.fail_count, 0)
from (values
  (5::bigint,
   'https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_epcot1/https://www.undercovertourist.com/orlando/1-day-disney-epcot-base-ticket/'),
  (7::bigint,
   'https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_sea1/https://www.undercovertourist.com/orlando/seaworld-orlando-single-day-ticket/'),
  (15::bigint,
   'https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_bgt1/https://www.undercovertourist.com/orlando/busch-gardens-tampa-single-day-ticket/'),
  (16::bigint,
   'https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_lego1/https://www.undercovertourist.com/orlando/legoland-florida-single-day-ticket/')
) as v(hub_id, dest_url, affiliate_url)
join public.wf_deals src on src.id = v.hub_id
where product.provider = 'undercover_tourist'
  and product.dest_url = v.dest_url
  and product.id not in (5, 7, 15, 16);

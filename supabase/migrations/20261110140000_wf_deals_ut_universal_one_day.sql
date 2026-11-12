-- Christmas Universal cards sell Universal's one-day, one-park base ticket,
-- not the 3-day base ticket (wf_deals row 6). Row 6 stays the Universal
-- ticket row for every other surface.
--
-- Product page read 2026-11-10: "Universal 1-Day Base Ticket", one day at
-- one theme park, no Park-to-Park, date picked at checkout. Universal's own
-- 2026 holiday release says the in-park holiday experiences (Grinchmas at
-- Islands of Adventure, the holiday parade at Universal Studios Florida) are
-- included with regular theme park admission, so one park for one day is the
-- smallest ticket that gets a visitor in.
--
-- Columns follow 20261109210000_wf_deals_ut_one_day_product_pages.sql:
-- category, subcategory, gradient, discount_text, badge, maps_to, photo_ref
-- and scope copied from row 6; active true; fail_count 0; link_ok null.
-- The affiliate_url is the CJ dlg raw path with PID 101643573, same as row 6.
-- Read back the new row's id after apply; lib/eventTicketDeals.js expects 66.

insert into public.wf_deals
  (provider, title, category, subcategory, gradient, discount_text, badge,
   dest_url, affiliate_url, maps_to, active, fail_count, photo_ref, scope)
select
  'undercover_tourist',
  'Universal Orlando 1-Day 1-Park Base Ticket',
  src.category,
  src.subcategory,
  src.gradient,
  src.discount_text,
  src.badge,
  'https://www.undercovertourist.com/orlando/universal-1-day-base-peak-ticket/',
  'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_uni1/https://www.undercovertourist.com/orlando/universal-1-day-base-peak-ticket/',
  src.maps_to,
  true,
  0,
  src.photo_ref,
  src.scope
from public.wf_deals src
where src.id = 6
  and not exists (
    select 1 from public.wf_deals existing
    where existing.provider = 'undercover_tourist'
      and existing.dest_url = 'https://www.undercovertourist.com/orlando/universal-1-day-base-peak-ticket/'
  );

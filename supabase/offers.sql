-- supabase/offers.sql — Undercover Tourist (CJ affiliate) attraction-ticket
-- offers as a SECOND inventory provider inside the existing wf_experiences table.
-- No new table: provider='undercover_tourist' rows reuse every downstream
-- consumer (the /api/experiences rails and the wf_things_to_do merge RPC).
--
-- 1) Schema extension (idempotent) — applied via migration
--    wf_experiences_add_maps_to. `maps_to` carries the canonical attraction key
--    so a discounted-ticket CTA can attach to a matched Wayfind place.
alter table public.wf_experiences add column if not exists maps_to text;

-- 2) How rows are populated
--    PRIMARY: app/api/cron/offers/route.js pulls the CJ Product API (advertiser
--    684659) and upserts rows whose product_url is CJ's own pre-tagged `link`
--    (carrying PID 101643573). It is DORMANT until CJ_API_TOKEN is set in the
--    Vercel runtime — then it fills correct destination URLs, images and prices.
--
--    OPTIONAL hand-seed below: one VERIFIED offer (SeaWorld Orlando) whose CJ
--    deep link was confirmed to resolve to the real 200 page with full
--    attribution (PID=101643573 + cjevent stamped). Run this to light up the
--    provider immediately, before the token lands. Every other attraction waits
--    for the Product API so its destination URL is correct (guessed slugs 404).
--
--    The deep-link FORM (verified empirically, not guessed): the destination is
--    a RAW PATH SEGMENT after /type/dlg/sid/{sid}/ — the ?url=<encoded> variant
--    returns a tracking pixel, never a click redirect. See lib/offers.js.
insert into public.wf_experiences
  (product_code, provider, dest_id, city, title, product_url, image, rating,
   reviews, from_price, duration_min, selling_out, lat, lng, maps_to,
   categories, flags, refreshed_at)
values
  ('UT-seaworld-orlando', 'undercover_tourist', '663', 'Orlando',
   'SeaWorld Orlando — Discount Tickets',
   'https://www.anrdoezrs.net/links/101643573/type/dlg/sid/card/https://www.undercovertourist.com/orlando/seaworld-orlando/',
   null, null, 0, null, null, false, 28.4114, -81.4639, 'seaworld orlando',
   array['theme','attractions']::text[], array[]::text[], now())
on conflict (product_code) do update set
  product_url  = excluded.product_url,
  maps_to      = excluded.maps_to,
  categories   = excluded.categories,
  refreshed_at = now();

-- RLS: wf_experiences already grants anon/authenticated SELECT using(true) and
-- has no write policy (service-role writes only) — UT rows inherit that, so no
-- policy change is needed.

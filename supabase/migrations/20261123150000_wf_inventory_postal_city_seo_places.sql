-- PENDING APPLY. Declared in scripts/migration-pending-apply.json.
-- Lane claude.exe (SEO engine 2026-11-23, owner order 2026-11-20 "run the best
-- words daily and make changes if we need to"). Same method as
-- 20261103230000 / 20261105120000: postal_city holds the verified mailing city
-- beside the Census locality; locality is not changed.
--
-- Why: the place page title reads "<Name> in <City>". Two pages ranking for
-- high volume names show a Census place nobody searches:
--   Tropical Park     "in Olympia Heights" (searches: "tropical park miami",
--                     49,500/mo family, page ranks 24 to 44)
--   Orange Park Mall  "in Bellair-Meadowbrook Terrace" ("orange park mall
--                     orange park fl", 40,500/mo, ranks 37)
-- Evidence per row (listing address city AND US Census address geocoder agree,
-- and the Census point sits beside the stored point):
--   Tropical Park: Greater Miami CVB official listing (miamiandbeaches.com,
--     /l/parks-and-recreation/tropical-park/2965) "7900 SW Bird Road, Miami
--     33155"; Census match 7900 SW 40TH ST, MIAMI, FL (25.7329,-80.3199),
--     about 0.8 km from the stored point inside the 275 acre park.
--   Orange Park Mall: 1910 Wells Road, Orange Park, FL 32073 (tenant brand
--     location pages, e.g. stores.aeropostale.com/fl/orange-park/1910-wells-road);
--     Census match 1910 WELLS RD, ORANGE PARK, FL, 32073 (30.1869,-81.7325),
--     about 0.2 km from the stored point.
-- Bahama Breeze (Four Corners) is NOT included: its candidate address geocodes
-- about 1.9 km from the stored point, so the match is unproven.
-- Reverse: supabase/data-fixes/20261123150000_wf_inventory_postal_city_seo_places_REVERSE.sql

begin;

update public.wf_inventory
   set postal_city = 'Miami',
       postal_city_source = 'miamiandbeaches.com official CVB listing 7900 SW Bird Road, Miami 33155; US Census address match 7900 SW 40TH ST, MIAMI (2026-11-23)'
 where place_id = 'ChIJcxJRMYe42YgRDSlj6Z_CDxk' and postal_city is null and locality = 'Olympia Heights';

update public.wf_inventory
   set postal_city = 'Orange Park',
       postal_city_source = 'tenant location pages 1910 Wells Road, Orange Park, FL 32073; US Census address match 1910 WELLS RD, ORANGE PARK 32073 (2026-11-23)'
 where place_id = 'ChIJcxJRXuvH5YgRwiUwwRpPoAk' and postal_city is null and locality = 'Bellair-Meadowbrook Terrace';

do $$
begin
  if (select count(*) from public.wf_inventory
       where (place_id = 'ChIJcxJRMYe42YgRDSlj6Z_CDxk' and postal_city = 'Miami')
          or (place_id = 'ChIJcxJRXuvH5YgRwiUwwRpPoAk' and postal_city = 'Orange Park')) <> 2 then
    raise exception 'postal_city seo places: rows do not hold the verified values; rolled back';
  end if;
end $$;

commit;

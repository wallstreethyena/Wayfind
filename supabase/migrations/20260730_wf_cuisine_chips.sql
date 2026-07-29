-- wf_cuisine_chips(metro) -- the chip list, DERIVED. Never a static array.
--
-- THE FLOOR (owner, 2026-07-29):
--   3+ high-confidence places  -> tier 'full'   a full chip
--   1-2                        -> tier 'thin'   shown with an honest count
--                                               ("2 nearby") in a secondary row
--   0                          -> absent, no row returned at all
--
-- Revenue logic behind the middle tier, in the owner's words: an honest thin chip
-- still routes a user to a bookable place; a hidden one routes them to Google.
-- So 1-2 is NOT gated out -- it is labelled.
--
-- ONLY HIGH-CONFIDENCE ROWS COUNT toward the gate. A 0.55 editorial-prose guess is
-- enough to tag a place for filtering but not enough to promise a user the
-- category exists. places_all is returned alongside places so the gap between
-- "tagged" and "confident" stays visible -- if those diverge badly for a cuisine,
-- the classifier is guessing, and that is worth seeing rather than averaging away.
--
-- ORDERED BY REAL LOCAL COVERAGE, never national search volume. National ranking
-- would bury cuban, puerto-rican and brazilian -- the three that matter most in
-- these metros and the whole reason the feature exists. Measured: cuban is a FULL
-- chip in Tampa (8) and absent in Orlando (0); puerto-rican is a THIN chip in
-- Orlando (2). A national list would have inverted both.
--
-- NO RADIUS PARAMETER, deliberately. Widening past the metro to pad a thin list is
-- the other way the filter-is-not-a-query rule gets broken.
create or replace function public.wf_cuisine_chips(p_metro text)
returns table(cuisine text, places integer, places_all integer, tier text,
              label text, avg_rating numeric)
language sql
stable
set search_path to 'public'
as $function$
  with tagged as (
    select c.cuisine,
           count(*)::int as places_all,
           count(*) filter (where i.cuisine_confidence >= 0.70)::int as places_hi,
           round(avg(nullif(i.signals->>'rating','')::numeric) filter (where i.cuisine_confidence >= 0.70), 2) as avg_rating
    from public.wf_inventory i
    cross join lateral unnest(coalesce(i.cuisines, '{}')) as c(cuisine)
    where i.category = 'food'
      and i.status = 'OPERATIONAL'
      and i.metro = p_metro
    group by c.cuisine
  )
  select cuisine, places_hi as places, places_all,
         case when places_hi >= 3 then 'full' else 'thin' end as tier,
         case when places_hi >= 3 then cuisine
              else cuisine || ' (' || places_hi || ' nearby)' end as label,
         avg_rating
  from tagged
  where places_hi >= 1
  order by places_hi desc, cuisine
$function$;

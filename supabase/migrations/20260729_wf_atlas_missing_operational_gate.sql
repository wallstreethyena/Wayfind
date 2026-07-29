-- wf_atlas_missing: gate editorial generation on the OPERATIONAL check.
--
-- Before this change the function selected every inventory row without a
-- wf_editorial entry, with no status predicate anywhere. Orlando happened to be
-- clean (684/684 rows status='OPERATIONAL'), so nothing closed was receiving
-- copy -- but that was the inventory being tidy, not the gate holding. The rule
-- is that a place failing the operational check gets no "known for" line, and a
-- rule enforced by coincidence is not enforced.
--
-- Measured effect at apply time, across the three target metros: candidates
-- 1528 -> 1527. One row excluded (Ben T Davis beach, status EXCLUDED). Small
-- today; structural from now on.
--
-- NULL is treated as NOT operational on purpose: an unknown status is not a
-- confirmed-open one, and writing editorial for a place we cannot confirm is
-- open is the exact failure this is meant to prevent.
CREATE OR REPLACE FUNCTION public.wf_atlas_missing(p_category text, p_metros text[], p_limit integer)
 RETURNS TABLE(place_id text, name text, metro text, category text, primary_type text, lat double precision, lng double precision, rating numeric, reviews integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select i.place_id, i.name, i.metro, i.category, i.primary_type, i.lat, i.lng,
         nullif(i.signals->>'rating','')::numeric as rating,
         coalesce(nullif(i.signals->>'reviews','')::int, 0) as reviews
  from public.wf_inventory i
  left join public.wf_editorial e on e.place_id = i.place_id
  where e.place_id is null
    and i.status = 'OPERATIONAL'
    and i.category = p_category
    and i.metro = any(p_metros)
  order by coalesce(nullif(i.signals->>'reviews','')::int, 0) desc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$function$;

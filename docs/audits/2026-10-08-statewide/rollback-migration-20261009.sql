-- Rollback for supabase/migrations/20261009120000_wf_tampa_bay_region_readers.sql
-- (ledger 20261009094755). Restores the four functions exactly as pg_get_functiondef
-- showed them before the apply (md5 of the live defs then: chips b493336d...,
-- coverage 29683ce2..., places ed847ae9..., things_to_do 0991f4af...).
--
-- ORDER MATTERS. Run section B (metro relabel reverse in reverse.sql) FIRST if the
-- 227 St. Pete rows were relabeled, or Tampa Bay pages lose those places when the
-- region read below is removed.
--
-- The two identity columns are dropped only if nothing has been written to them, so a
-- legitimate later backfill is never thrown away.

CREATE OR REPLACE FUNCTION public.wf_cuisine_chips(p_metro text)
 RETURNS TABLE(cuisine text, places integer, places_all integer, tier text, label text, avg_rating numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with tagged as (
    select c.cuisine,
           count(*)::int as places_all,
           -- PER-LABEL: this row is confident for THIS cuisine, not for any
           -- cuisine it happens to carry.
           count(*) filter (
             where coalesce((i.cuisine_conf ->> c.cuisine)::numeric, i.cuisine_confidence) >= 0.70
           )::int as places_hi,
           round(avg(nullif(i.signals->>'rating','')::numeric) filter (
             where coalesce((i.cuisine_conf ->> c.cuisine)::numeric, i.cuisine_confidence) >= 0.70
           ), 2) as avg_rating
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

CREATE OR REPLACE FUNCTION public.wf_cuisine_coverage(p_metro text DEFAULT NULL::text)
 RETURNS TABLE(metro text, cuisine text, places integer, avg_rating numeric, with_reviews integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select i.metro, c.cuisine, count(*)::int as places,
         round(avg(nullif(i.signals->>'rating','')::numeric), 2) as avg_rating,
         count(*) filter (where coalesce(nullif(i.signals->>'reviews','')::int,0) >= 100)::int as with_reviews
  from public.wf_inventory i
  cross join lateral unnest(coalesce(i.cuisines, '{}')) as c(cuisine)
  where i.category = 'food'
    and i.status = 'OPERATIONAL'
    and (p_metro is null or i.metro = p_metro)
  group by i.metro, c.cuisine
  order by i.metro, places desc, c.cuisine
$function$;

CREATE OR REPLACE FUNCTION public.wf_cuisine_places(p_metro text, p_cuisine text)
 RETURNS TABLE(place_id text, name text, lat double precision, lng double precision, rating numeric, reviews integer, price_level text, photo_ref text, primary_type text, confidence numeric, wf_score integer, hook text, why_here text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with base as (
    select i.place_id, i.name, i.lat, i.lng,
           nullif(i.signals->>'rating','')::numeric as rating,
           coalesce(nullif(i.signals->>'reviews','')::int, 0) as reviews,
           nullif(i.signals->>'price','') as price_level,
           i.photo_ref, i.primary_type,
           coalesce((i.cuisine_conf ->> p_cuisine)::numeric, i.cuisine_confidence) as confidence,
           case when e.verified then e.hook end as hook,
           case when e.verified then e.why_here end as why_here
    from public.wf_inventory i
    left join public.wf_editorial e on e.place_id = i.place_id
    where i.category = 'food'
      and i.status = 'OPERATIONAL'
      and i.metro = p_metro
      and p_cuisine = any(coalesce(i.cuisines, '{}'))
  )
  select b.place_id, b.name, b.lat, b.lng, b.rating, b.reviews, b.price_level,
         b.photo_ref, b.primary_type, b.confidence,
         case when b.rating is null or b.rating <= 0 then null
              else round((((b.reviews::numeric / (b.reviews + 60)) * b.rating
                          + (60::numeric / (b.reviews + 60)) * 3.9) / 5) * 100)::int end as wf_score,
         b.hook, b.why_here
  from base b
  order by coalesce(b.confidence, 0) desc,
           case when b.rating is null or b.rating <= 0 then -1
                else (((b.reviews::numeric / (b.reviews + 60)) * b.rating
                       + (60::numeric / (b.reviews + 60)) * 3.9) / 5) * 100 end desc,
           b.name
$function$;

CREATE OR REPLACE FUNCTION public.wf_things_to_do(p_lat double precision, p_lng double precision, p_local_hour numeric DEFAULT 12, p_temp numeric DEFAULT NULL::numeric, p_condition text DEFAULT NULL::text, p_radius_mi double precision DEFAULT 30, p_limit integer DEFAULT 10)
 RETURNS TABLE(rank integer, kind text, id text, title text, subtitle text, rating double precision, reviews integer, price_from integer, duration_min integer, selling_out boolean, distance_mi double precision, score double precision, photo_ref text, image_url text, booking_url text, category text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with um as (
  select metro, lat, lng from wf_inventory where lat is not null and lng is not null
  order by (power(lat-p_lat,2)+power(lng-p_lng,2)) asc limit 1
),
cov as (
  select (3958.7554*2*asin(sqrt(power(sin(radians(lat-p_lat)/2),2)
           + cos(radians(p_lat))*cos(radians(lat))*power(sin(radians(lng-p_lng)/2),2)))) <= 75 as in_coverage
  from um
),
cities as (
  select case when not coalesce((select in_coverage from cov), false) then array[]::text[]
    else case (select metro from um)
      when 'manatee-sarasota' then array['Sarasota']
      when 'tampa' then array['Tampa','St. Petersburg','Clearwater']
      when 'orlando' then array['Orlando']
      else array[initcap(replace((select metro from um),'-',' '))] end
  end as c
),
places as (
  select 'place'::text kind, bp.place_id id, bp.name title, bp.metro subtitle,
         bp.rating, bp.reviews, null::int price_from, null::int duration_min,
         false selling_out, bp.distance_mi, bp.score, bp.photo_ref,
         null::text image_url, null::text booking_url, bp.category
  from wf_best_picks(p_lat,p_lng,p_local_hour,p_temp,p_condition,p_radius_mi,40,'things_to_do',null) bp
),
exp_scored as (
  select distinct on (e.product_code) e.product_code id, e.title, e.city subtitle, e.rating, e.reviews, e.from_price price_from,
    e.duration_min, e.selling_out, e.image image_url, e.product_url booking_url,
    (case when e.reviews>0 then (e.reviews::numeric/(e.reviews+60))*coalesce(e.rating,4.4)+(60.0/(e.reviews+60))*4.4 else coalesce(e.rating,4.4) end) bayes
  from wf_experiences e cross join cities cc
  where (e.city = any(cc.c)
     or (e.lat is not null and e.lng is not null
         and 3958.7554*2*asin(sqrt(power(sin(radians(e.lat-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(e.lat))*power(sin(radians(e.lng-p_lng)/2),2))) <= p_radius_mi
         and coalesce((select in_coverage from cov), false)))
    and coalesce(e.link_ok, true)
    and public.wf_quality10(e.rating::numeric, coalesce(e.reviews,0)) >= 7.5
),
exp_final as (
  select 'experience'::text kind, id, title, subtitle, rating, reviews, price_from, duration_min, selling_out,
    null::double precision distance_mi,
    (1.15 + case when selling_out then 0.3 else 0 end
        + case when (p_temp is not null and p_temp>=82) and title ~* 'kayak|boat|snorkel|dolphin|paddle|sail|water|cruise|beach' then 0.2 else 0 end)
      * (0.5*least(1,greatest(0,(bayes-3.5)/1.5)) + 0.3*least(1,greatest(0,ln(reviews+1)/ln(5000))) + 0.12) score,
    null::text photo_ref, image_url, booking_url, 'experience'::text category
  from exp_scored
)
select row_number() over (order by c.score desc)::int rank,
  c.kind, c.id, c.title, c.subtitle, c.rating, c.reviews, c.price_from, c.duration_min,
  c.selling_out, round(c.distance_mi::numeric,2)::double precision, round(c.score::numeric,4)::double precision,
  c.photo_ref, c.image_url, c.booking_url, c.category
from (select * from places union all select * from exp_final) c
order by c.score desc limit greatest(p_limit,1);
$function$;

drop function if exists public.wf_metro_members(text);

do $$ begin
  if not exists (select 1 from public.wf_inventory where locality is not null or county is not null) then
    alter table public.wf_inventory drop column if exists locality;
    alter table public.wf_inventory drop column if exists county;
  else
    raise notice 'locality/county hold data; columns kept';
  end if;
end $$;

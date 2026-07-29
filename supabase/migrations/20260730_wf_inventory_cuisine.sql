-- Cuisine, persisted on the inventory row.
--
-- Users cannot search by kind of food today because cuisine is stored NOWHERE.
-- wf_inventory.signals holds price, rating and reviews only: "KPOT Korean BBQ &
-- Hot Pot" had nothing in its record saying korean.
--
-- THE RULE this schema serves: cuisine is a FILTER on already-geofenced local
-- inventory, never a search query. These columns exist so the filter can run
-- against rows we already hold. If a label ever reaches a Places text search,
-- Google returns restaurants in Puerto Rico -- see
-- scripts/check-cuisine-never-queried.mjs, which fails the build on that path.
--
-- confidence and source are stored rather than collapsed. A types[] hit (0.9) and
-- a lone name token (0.7) are not the same evidence, and keeping them apart is
-- the only thing that lets the cron re-check the weak ones.
alter table public.wf_inventory
  add column if not exists cuisines            text[],
  add column if not exists cuisine_confidence  numeric(3,2),
  add column if not exists cuisine_sources     text[],
  -- Why classification ended the way it did. 'unclassifiable' is an HONEST answer
  -- and is distinct from NULL, which means never attempted. Conflating those two
  -- is what let atlas-build hide a 100% failure rate for five days.
  add column if not exists cuisine_reason      text,
  add column if not exists cuisine_checked_at  timestamptz;

create index if not exists wf_inventory_cuisines_idx on public.wf_inventory using gin (cuisines);
create index if not exists wf_inventory_cuisine_recheck_idx
  on public.wf_inventory (cuisine_confidence, cuisine_checked_at)
  where category = 'food';

comment on column public.wf_inventory.cuisines is
  'Cuisine labels from lib/cuisine.classifyCuisine. A FILTER over local inventory, never a query term. Empty array with cuisine_reason=''unclassifiable'' is an honest answer; NULL means never attempted.';
comment on column public.wf_inventory.cuisine_confidence is
  '0.9 google types[] · 0.7 name+dish pattern · 0.55 editorial prose. Below 0.7 the cron re-checks.';

-- Coverage, per metro per cuisine. The chip list is DERIVED from this, never a
-- static array: 0 places means no chip, and the radius is NEVER widened to pad a
-- list -- note this function takes no radius at all. Returning the honest count
-- is the point, so a thin cuisine can be gated out or shown with its real number.
create or replace function public.wf_cuisine_coverage(p_metro text default null)
returns table(metro text, cuisine text, places integer, avg_rating numeric, with_reviews integer)
language sql
stable
set search_path to 'public'
as $function$
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

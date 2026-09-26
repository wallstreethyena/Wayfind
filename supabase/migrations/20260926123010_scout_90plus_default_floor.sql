-- Keep the database-side scout default aligned with the owner-requested
-- 9.0 Wayfind Score floor used by lib/scoutAdjudicate.js.

create or replace function public.wf_scout_candidates(
  p_limit integer default 40,
  p_floor integer default 90
)
returns table(place_id text, name text, score integer, rating numeric, reviews integer, details jsonb)
language sql
stable
set search_path = public
as $$
  select p.place_id,
         p.name,
         round((((coalesce((p.signals->>'reviews')::numeric,0) * (p.signals->>'rating')::numeric) + 60*3.9)
               / (coalesce((p.signals->>'reviews')::numeric,0) + 60)) / 5 * 100)::integer as score,
         (p.signals->>'rating')::numeric as rating,
         coalesce((p.signals->>'reviews')::numeric,0)::integer as reviews,
         c.v as details
  from public.wf_place_ids p
  join public.wf_promotion_queue q on q.place_id = p.place_id
  join public.wf_places_cache   c on c.k = 'pd1|' || p.place_id
  left join public.wf_inventory i on i.place_id = p.place_id
  left join public.wf_scout_verdicts sv on sv.place_id = p.place_id
  where i.place_id is null
    and sv.place_id is null
    and q.status = 'rejected'
    and q.reject_reason like 'unclassified%'
    and p.signals->>'rating' is not null
    and round((((coalesce((p.signals->>'reviews')::numeric,0) * (p.signals->>'rating')::numeric) + 60*3.9)
              / (coalesce((p.signals->>'reviews')::numeric,0) + 60)) / 5 * 100) >= p_floor
    and coalesce(c.v->>'businessStatus','OPERATIONAL') = 'OPERATIONAL'
  order by score desc, reviews desc
  limit greatest(1, least(p_limit, 200));
$$;

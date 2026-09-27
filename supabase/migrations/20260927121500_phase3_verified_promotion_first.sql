-- Phase 3 (2026-09-27): spend the next free Google Details capacity on
-- destinations Wayfind has already proven before touching unreviewed backlog.
--
-- This does NOT change spend caps, batch caps, score math, freshness rules, or
-- validation. It changes only claim order among rows that are already pending.

create or replace function public.wf_promotion_claim(
  p_metro          text    default null,
  p_limit          integer default 10,
  p_lease_minutes  integer default 15
)
returns table (
  place_id text,
  name     text,
  lat      double precision,
  lng      double precision,
  metro    text,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wf_promotion_queue q
     set status = 'pending', claimed_at = null
   where q.status = 'working'
     and q.claimed_at < now() - make_interval(mins => greatest(1, p_lease_minutes));

  return query
  with picked as (
    select q.place_id
      from public.wf_promotion_queue q
     where q.status = 'pending'
       and q.next_attempt_at <= now()
       and (p_metro is null or q.metro = p_metro)
     order by
       case
         when exists (
           select 1
             from public.wf_scout_verdicts sv
            where sv.place_id = q.place_id
              and sv.accepted is true
         )
         or q.reason in ('phase2-deterministic-recovery', 'scout-deterministic-recovery')
         then 1 else 0
       end desc,
       q.priority desc,
       q.enqueued_at asc
     limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update skip locked
  )
  update public.wf_promotion_queue q
     set status          = 'working',
         claimed_at      = now(),
         last_attempt_at = now(),
         attempts        = q.attempts + 1
    from picked pk
    join public.wf_place_ids ix on ix.place_id = pk.place_id
   where q.place_id = pk.place_id
  returning q.place_id, ix.name, ix.lat, ix.lng, q.metro, q.attempts;
end $$;

-- Keep the current production queue explicit too. The claim function above is
-- the permanent rule; this bump makes the queue visibly self-describing in
-- command-center/debug reads and is idempotent.
with scored as (
  select p.place_id,
         coalesce((p.signals->>'reviews')::integer,0) as reviews,
         round((((coalesce((p.signals->>'reviews')::numeric,0)*(p.signals->>'rating')::numeric)+60*3.9)
           /(coalesce((p.signals->>'reviews')::numeric,0)+60))/5*100)::integer as score
  from public.wf_place_ids p
  where p.signals->>'rating' is not null
),
proven as (
  select q.place_id,s.score,s.reviews
    from public.wf_promotion_queue q
    join scored s using(place_id)
    left join public.wf_scout_verdicts sv using(place_id)
   where q.status='pending'
     and s.score>=90
     and not exists (select 1 from public.wf_inventory i where i.place_id=q.place_id)
     and (
       sv.accepted is true
       or q.reason in ('phase2-deterministic-recovery','scout-deterministic-recovery')
     )
)
update public.wf_promotion_queue q
   set priority = greatest(
     q.priority,
     3000000 + p.score*1000 + least(greatest(p.reviews,0),999)
   )
  from proven p
 where q.place_id=p.place_id;

comment on function public.wf_promotion_claim(text,integer,integer) is
  'Claims pending promotion rows with scout-accepted or deterministic-recovery destinations first, then preserves the existing priority/enqueue order. Spend, freshness, validation and batch caps remain unchanged.';

-- 2026-09-25: make the owner-requested 9.0+ missing-place lane first-class
-- without raising provider spend. Existing spend gates still control promotion.

create or replace function public.wf_enqueue_promotion(
  p_place_id text,
  p_reason text default 'trigger'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_rating numeric;
  v_reviews integer;
  v_score integer;
  v_priority integer;
  v_metro text;
begin
  if p_place_id is null or length(trim(p_place_id)) = 0 then return 'skip:no-id'; end if;
  if exists (select 1 from public.wf_inventory where place_id = p_place_id) then return 'skip:already-inventory'; end if;

  select p.lat, p.lng, nullif(p.signals->>'rating','')::numeric,
         coalesce(nullif(p.signals->>'reviews','')::integer,0)
    into v_lat, v_lng, v_rating, v_reviews
  from public.wf_place_ids p where p.place_id = p_place_id;

  if v_lat is null or v_lng is null then return 'skip:no-coords'; end if;
  v_metro := public.wf_bucket_metro(v_lat, v_lng);
  if v_metro is null then return 'skip:outside-served-metros'; end if;
  if v_metro = 'global' then return 'skip:global-bucket-not-automated'; end if;

  if v_rating is not null then
    v_score := round(((((greatest(v_reviews,0)::numeric * v_rating) + 60*3.9)
      / (greatest(v_reviews,0) + 60)) / 5) * 100)::integer;
  end if;

  v_priority := case
    when v_score >= 90 then 1000000 + v_score*1000 + least(greatest(v_reviews,0),999)
    else least(greatest(v_reviews,0),1000000)
  end;

  insert into public.wf_promotion_queue(place_id,metro,priority,reason)
  values (p_place_id,v_metro,v_priority,p_reason)
  on conflict(place_id) do update
    set metro=excluded.metro,
        priority=greatest(public.wf_promotion_queue.priority,excluded.priority);

  return 'queued:'||v_metro;
exception when others then
  return 'error:'||left(sqlerrm,120);
end
$$;

revoke all on function public.wf_enqueue_promotion(text,text) from public, anon, authenticated;
grant execute on function public.wf_enqueue_promotion(text,text) to service_role;

create or replace function public.wf_promotion_enqueue_by_score(
  p_floor integer default 90,
  p_limit integer default 1000,
  p_metro text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0;
begin
  with cand as (
    select p.place_id,
           public.wf_bucket_metro(p.lat,p.lng) as m,
           coalesce((p.signals->>'reviews')::integer,0) as rv,
           round((((coalesce((p.signals->>'reviews')::numeric,0)*(p.signals->>'rating')::numeric)+60*3.9)
             /(coalesce((p.signals->>'reviews')::numeric,0)+60))/5*100)::integer as sc
    from public.wf_place_ids p
    where p.lat is not null and p.lng is not null
      and p.signals->>'rating' is not null
      and not exists (select 1 from public.wf_inventory i where i.place_id=p.place_id)
  ), keep as (
    select place_id,m,rv,sc from cand
    where m is not null and m <> 'global'
      and sc >= p_floor
      and (p_metro is null or m=p_metro)
    order by sc desc,rv desc
    limit greatest(0,coalesce(p_limit,1000))
  )
  insert into public.wf_promotion_queue(place_id,metro,priority,reason)
  select place_id,m,1000000+sc*1000+least(greatest(rv,0),999),'score>='||p_floor
  from keep
  on conflict(place_id) do update
    set metro=excluded.metro,
        priority=greatest(public.wf_promotion_queue.priority,excluded.priority);

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.wf_promotion_enqueue_by_score(integer,integer,text) from public, anon, authenticated;
grant execute on function public.wf_promotion_enqueue_by_score(integer,integer,text) to service_role;

with scored as (
  select p.place_id,
         coalesce((p.signals->>'reviews')::integer,0) rv,
         round((((coalesce((p.signals->>'reviews')::numeric,0)*(p.signals->>'rating')::numeric)+60*3.9)
           /(coalesce((p.signals->>'reviews')::numeric,0)+60))/5*100)::integer sc
  from public.wf_place_ids p
  where p.signals->>'rating' is not null
    and not exists (select 1 from public.wf_inventory i where i.place_id=p.place_id)
)
update public.wf_promotion_queue q
set priority=greatest(q.priority,1000000+s.sc*1000+least(greatest(s.rv,0),999))
from scored s
where q.place_id=s.place_id and s.sc>=90;

update public.wf_promotion_queue q
set status='pending', attempts=0, next_attempt_at=now(), claimed_at=null,
    reject_reason=null, last_error=null, reason='90plus-accepted-recovery'
from public.wf_scout_verdicts sv
where q.place_id=sv.place_id
  and sv.accepted is true and sv.score>=90
  and not exists (select 1 from public.wf_inventory i where i.place_id=q.place_id);

update public.wf_promotion_queue q
set status='pending', attempts=0, next_attempt_at=now(), claimed_at=null,
    reject_reason=null, last_error=null, reason='90plus-transient-retry'
where q.status='rejected'
  and q.reject_reason='max attempts'
  and q.last_error ilike 'details 429:%'
  and exists (
    select 1 from public.wf_place_ids p
    where p.place_id=q.place_id and p.signals->>'rating' is not null
      and round((((coalesce((p.signals->>'reviews')::numeric,0)*(p.signals->>'rating')::numeric)+60*3.9)
        /(coalesce((p.signals->>'reviews')::numeric,0)+60))/5*100) >= 90
  );

update public.wf_promotion_queue q
set status='pending', attempts=0, next_attempt_at=now(), claimed_at=null,
    reject_reason=null, last_error=null, reason='90plus-retry-no-cache'
where q.status='rejected'
  and q.reject_reason like 'unclassified%'
  and not exists (select 1 from public.wf_places_cache c where c.k='pd1|'||q.place_id)
  and exists (
    select 1 from public.wf_place_ids p
    where p.place_id=q.place_id and p.signals->>'rating' is not null
      and round((((coalesce((p.signals->>'reviews')::numeric,0)*(p.signals->>'rating')::numeric)+60*3.9)
        /(coalesce((p.signals->>'reviews')::numeric,0)+60))/5*100) >= 90
  );

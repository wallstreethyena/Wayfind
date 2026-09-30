
-- Every Florida place card that becomes operational without a truthful photo
-- source must enter the existing free photo-repair lane immediately.
-- This does not call Google or change photo/cache TTLs.

create or replace function public.wf_queue_inventory_missing_photo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  fl_metros constant text[] := array[
    'florida','manatee-sarasota','orlando','tampa','miami-dade','broward',
    'st-pete','palm-beach','miami','immokalee-fl','avon-park-fl',
    'panama-city-florida','st-augustine-fl','key-west','pompano-beach-fl',
    'ocala-fl','spring-hill-fl','jacksonville-fl','keys'
  ];
  new_owned_url text;
  old_owned_url text;
  new_missing boolean := false;
  old_missing boolean := false;
begin
  new_owned_url := nullif(trim(coalesce(
    new.signals->>'photo_url',
    new.signals->>'photoUrl',
    ''
  )), '');

  new_missing :=
    new.status = 'OPERATIONAL'
    and coalesce(new.excluded, false) = false
    and new.metro = any(fl_metros)
    and new.photo_ref is null
    and new_owned_url is null
    and not exists (
      select 1
      from public.wf_place_photo p
      where p.place_id = new.place_id
        and p.status = 'active'
    );

  if tg_op = 'UPDATE' then
    old_owned_url := nullif(trim(coalesce(
      old.signals->>'photo_url',
      old.signals->>'photoUrl',
      ''
    )), '');

    old_missing :=
      old.status = 'OPERATIONAL'
      and coalesce(old.excluded, false) = false
      and old.metro = any(fl_metros)
      and old.photo_ref is null
      and old_owned_url is null;
  end if;

  if new_missing and (tg_op = 'INSERT' or not old_missing) then
    insert into public.wf_photo_repair_queue (
      place_id,
      current_ref,
      failure_reason,
      first_seen_at,
      last_seen_at,
      detections,
      attempts,
      next_attempt_at,
      status,
      updated_at
    )
    values (
      new.place_id,
      null,
      'no-source',
      now(),
      now(),
      1,
      0,
      now(),
      'open',
      now()
    )
    on conflict (place_id) do update
      set current_ref = null,
          failure_reason = 'no-source',
          last_seen_at = now(),
          detections = public.wf_photo_repair_queue.detections + 1,
          next_attempt_at = case
            when public.wf_photo_repair_queue.status in ('open','budget_blocked','recovered')
              then least(public.wf_photo_repair_queue.next_attempt_at, now())
            else public.wf_photo_repair_queue.next_attempt_at
          end,
          status = case
            when public.wf_photo_repair_queue.status = 'recovered' then 'open'
            else public.wf_photo_repair_queue.status
          end,
          updated_at = now();
  end if;

  return new;
end
$$;

revoke all on function public.wf_queue_inventory_missing_photo() from public, anon, authenticated;

drop trigger if exists wf_inventory_queue_missing_photo_trg on public.wf_inventory;
create trigger wf_inventory_queue_missing_photo_trg
after insert or update of photo_ref, signals, status, excluded, metro
on public.wf_inventory
for each row
execute function public.wf_queue_inventory_missing_photo();

-- One-time census: put every currently missing Florida photo source into the
-- same queue. Idempotent if this migration is replayed in another environment.
insert into public.wf_photo_repair_queue (
  place_id,
  current_ref,
  failure_reason,
  first_seen_at,
  last_seen_at,
  detections,
  attempts,
  next_attempt_at,
  status,
  updated_at
)
select
  i.place_id,
  null,
  'no-source',
  now(),
  now(),
  1,
  0,
  now(),
  'open',
  now()
from public.wf_inventory i
left join public.wf_place_photo p
  on p.place_id = i.place_id
 and p.status = 'active'
where i.status = 'OPERATIONAL'
  and coalesce(i.excluded, false) = false
  and i.metro = any(array[
    'florida','manatee-sarasota','orlando','tampa','miami-dade','broward',
    'st-pete','palm-beach','miami','immokalee-fl','avon-park-fl',
    'panama-city-florida','st-augustine-fl','key-west','pompano-beach-fl',
    'ocala-fl','spring-hill-fl','jacksonville-fl','keys'
  ])
  and i.photo_ref is null
  and nullif(trim(coalesce(i.signals->>'photo_url', i.signals->>'photoUrl', '')), '') is null
  and p.place_id is null
on conflict (place_id) do nothing;

-- Repair stale bookkeeping where the inventory no longer has the Google ref
-- but the queue still says source-unavailable.
update public.wf_photo_repair_queue q
set failure_reason = 'no-source',
    next_attempt_at = case when q.status = 'open' then least(q.next_attempt_at, now()) else q.next_attempt_at end,
    updated_at = now()
from public.wf_inventory i
where i.place_id = q.place_id
  and i.status = 'OPERATIONAL'
  and coalesce(i.excluded, false) = false
  and i.photo_ref is null
  and nullif(trim(coalesce(i.signals->>'photo_url', i.signals->>'photoUrl', '')), '') is null
  and q.failure_reason = 'source-unavailable';

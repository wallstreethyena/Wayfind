-- Reserve a table: instant booking against availability Wayfind holds for partner restaurants.
-- Owner approved 2026-11-12. Source: supabase/migrations/20261111210000_wf_reserve_partners_requests.sql

create table public.wf_reserve_partners (
  place_id text primary key,
  name text not null,
  contact_email text not null,
  phone text,
  stage text not null default 'demo' check (stage in ('demo','live')),
  active boolean not null default true,
  timezone text not null default 'America/New_York',
  max_party int not null default 12 check (max_party between 1 and 40),
  capacity_covers int not null default 40 check (capacity_covers between 1 and 1000),
  seating_minutes int not null default 90 check (seating_minutes between 30 and 360),
  lead_minutes int not null default 60 check (lead_minutes between 0 and 1440),
  window_days int not null default 60 check (window_days between 1 and 365),
  hours jsonb not null check (jsonb_typeof(hours) = 'object'),
  closed_dates date[] not null default '{}',
  manage_token_hash text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wf_reserve_bookings (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique check (confirmation_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  place_id text not null references public.wf_reserve_partners(place_id),
  user_id uuid not null,
  guest_name text not null,
  party_size int not null check (party_size between 1 and 40),
  reserve_date date not null,
  reserve_time time not null,
  note text,
  guest_phone text,
  phone_consent_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','proposed')),
  proposed_date date,
  proposed_time time,
  cancelled_by text check (cancelled_by in ('guest','restaurant')),
  cancel_reason text,
  idempotency_key uuid not null,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_reserve_bookings_phone_needs_consent check (guest_phone is null or phone_consent_at is not null),
  constraint wf_reserve_bookings_user_idem unique (user_id, idempotency_key)
);
create index wf_reserve_bookings_place_date on public.wf_reserve_bookings(place_id, reserve_date) where status <> 'cancelled';
create index wf_reserve_bookings_user_created on public.wf_reserve_bookings(user_id, created_at desc);

alter table public.wf_reserve_partners enable row level security;
alter table public.wf_reserve_bookings enable row level security;
revoke all on public.wf_reserve_partners, public.wf_reserve_bookings from public, anon, authenticated;
grant select, insert, update, delete on public.wf_reserve_partners, public.wf_reserve_bookings to service_role;

grant select on public.wf_reserve_bookings to authenticated;
create policy wf_reserve_bookings_own_select on public.wf_reserve_bookings
  for select to authenticated using (user_id = auth.uid());

create function public.wf_reserve_slots(p_place_id text, p_date date, p_party int, p_exclude uuid default null)
returns table(slot time)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  pt public.wf_reserve_partners%rowtype;
  now_local timestamp;
  day_key text;
  dur interval;
begin
  select * into pt from public.wf_reserve_partners where place_id = p_place_id and active;
  if not found or p_date is null or p_party is null or p_party < 1 or p_party > pt.max_party then
    return;
  end if;
  now_local := now() at time zone pt.timezone;
  if p_date < now_local::date or p_date > now_local::date + pt.window_days or p_date = any(pt.closed_dates) then
    return;
  end if;
  day_key := (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from p_date)::int + 1];
  dur := pt.seating_minutes * interval '1 minute';
  return query
    select c.ts::time
    from (
      select distinct g.ts
      from jsonb_array_elements(coalesce(pt.hours -> day_key, '[]'::jsonb)) w(win),
           lateral generate_series(p_date + (w.win ->> 0)::time, p_date + (w.win ->> 1)::time, interval '15 minutes') g(ts)
    ) c
    where c.ts >= now_local + pt.lead_minutes * interval '1 minute'
      and coalesce((
        select sum(b.party_size)
        from public.wf_reserve_bookings b
        where b.place_id = p_place_id
          and b.status <> 'cancelled'
          and b.reserve_date between p_date - 1 and p_date + 1
          and (p_exclude is null or b.id <> p_exclude)
          and (b.reserve_date + b.reserve_time) < c.ts + dur
          and c.ts < (b.reserve_date + b.reserve_time) + dur
      ), 0) + p_party <= pt.capacity_covers
    order by c.ts;
end;
$fn$;

create function public.wf_reserve_book(
  p_place_id text, p_user_id uuid, p_date date, p_time time, p_party int,
  p_name text, p_note text, p_phone text, p_consent boolean, p_idem uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  pt public.wf_reserve_partners%rowtype;
  existing public.wf_reserve_bookings%rowtype;
  created public.wf_reserve_bookings%rowtype;
  now_local timestamp;
  day_key text;
  on_grid boolean;
  code text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  tries int := 0;
  constraint_hit text;
begin
  if p_user_id is null or p_idem is null or p_place_id is null or p_date is null or p_time is null
     or p_party is null or p_party < 1 or coalesce(btrim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE');
  end if;

  select * into existing from public.wf_reserve_bookings where user_id = p_user_id and idempotency_key = p_idem;
  if found then
    select * into pt from public.wf_reserve_partners where place_id = existing.place_id;
    return jsonb_build_object('ok', true, 'booking', to_jsonb(existing) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
  end if;

  perform pg_advisory_xact_lock(hashtext('wf_reserve:' || p_place_id));

  select * into existing from public.wf_reserve_bookings where user_id = p_user_id and idempotency_key = p_idem;
  if found then
    select * into pt from public.wf_reserve_partners where place_id = existing.place_id;
    return jsonb_build_object('ok', true, 'booking', to_jsonb(existing) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
  end if;

  select * into pt from public.wf_reserve_partners where place_id = p_place_id and active;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE'); end if;
  if p_party > pt.max_party then return jsonb_build_object('ok', false, 'code', 'PARTY_TOO_LARGE'); end if;

  now_local := now() at time zone pt.timezone;
  if p_date < now_local::date or p_date > now_local::date + pt.window_days then
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_WINDOW');
  end if;

  day_key := (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from p_date)::int + 1];
  select exists (
    select 1
    from jsonb_array_elements(coalesce(pt.hours -> day_key, '[]'::jsonb)) w(win),
         lateral generate_series(p_date + (w.win ->> 0)::time, p_date + (w.win ->> 1)::time, interval '15 minutes') g(ts)
    where g.ts = p_date + p_time
  ) into on_grid;
  if p_date = any(pt.closed_dates) or not on_grid then
    return jsonb_build_object('ok', false, 'code', 'CLOSED');
  end if;
  if p_date + p_time < now_local + pt.lead_minutes * interval '1 minute' then
    return jsonb_build_object('ok', false, 'code', 'TOO_SOON');
  end if;

  if exists (select 1 from public.wf_reserve_bookings where user_id = p_user_id and place_id = p_place_id and reserve_date = p_date and status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end if;
  if (
    select count(*)
    from public.wf_reserve_bookings b
    join public.wf_reserve_partners bp on bp.place_id = b.place_id
    where b.user_id = p_user_id and b.status <> 'cancelled'
      and (b.reserve_date + b.reserve_time) >= (now() at time zone bp.timezone)
  ) >= 3 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;

  if not exists (select 1 from public.wf_reserve_slots(p_place_id, p_date, p_party) s where s.slot = p_time) then
    return jsonb_build_object('ok', false, 'code', 'SLOT_FULL');
  end if;

  loop
    tries := tries + 1;
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.wf_reserve_bookings
        (confirmation_code, place_id, user_id, guest_name, party_size, reserve_date, reserve_time, note,
         guest_phone, phone_consent_at, status, idempotency_key)
      values
        (code, p_place_id, p_user_id, btrim(p_name), p_party, p_date, p_time, nullif(btrim(coalesce(p_note, '')), ''),
         case when coalesce(p_consent, false) then nullif(btrim(coalesce(p_phone, '')), '') else null end,
         case when coalesce(p_consent, false) and nullif(btrim(coalesce(p_phone, '')), '') is not null then now() else null end,
         'confirmed', p_idem)
      returning * into created;
      exit;
    exception when unique_violation then
      get stacked diagnostics constraint_hit = constraint_name;
      if constraint_hit = 'wf_reserve_bookings_user_idem' then
        select * into existing from public.wf_reserve_bookings where user_id = p_user_id and idempotency_key = p_idem;
        return jsonb_build_object('ok', true, 'booking', to_jsonb(existing) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
      end if;
      if tries >= 10 then return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE'); end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'booking', to_jsonb(created) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
end;
$fn$;

create function public.wf_reserve_cancel(
  p_booking_id uuid, p_actor text, p_user_id uuid default null, p_place_id text default null, p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  b public.wf_reserve_bookings%rowtype;
  pt public.wf_reserve_partners%rowtype;
begin
  if p_actor is null or p_actor not in ('guest', 'restaurant') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTOR');
  end if;
  select * into b from public.wf_reserve_bookings where id = p_booking_id for update;
  if not found
     or (p_actor = 'guest' and (p_user_id is null or b.user_id <> p_user_id))
     or (p_actor = 'restaurant' and (p_place_id is null or b.place_id <> p_place_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into pt from public.wf_reserve_partners where place_id = b.place_id;
  if b.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
  end if;
  if p_actor = 'guest' and (b.reserve_date + b.reserve_time) <= (now() at time zone pt.timezone) then
    return jsonb_build_object('ok', false, 'code', 'TOO_LATE');
  end if;
  update public.wf_reserve_bookings
     set status = 'cancelled', cancelled_by = p_actor, cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         proposed_date = null, proposed_time = null, updated_at = now()
   where id = b.id
   returning * into b;
  return jsonb_build_object('ok', true, 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
end;
$fn$;

create function public.wf_reserve_propose(p_booking_id uuid, p_place_id text, p_date date, p_time time)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  b public.wf_reserve_bookings%rowtype;
  pt public.wf_reserve_partners%rowtype;
begin
  if p_booking_id is null or p_place_id is null or p_date is null or p_time is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtext('wf_reserve:' || p_place_id));
  select * into b from public.wf_reserve_bookings where id = p_booking_id and place_id = p_place_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into pt from public.wf_reserve_partners where place_id = b.place_id;
  if b.status not in ('confirmed', 'proposed') or (b.reserve_date + b.reserve_time) <= (now() at time zone pt.timezone) then
    return jsonb_build_object('ok', false, 'code', 'NOT_PROPOSABLE');
  end if;
  if b.reserve_date = p_date and b.reserve_time = p_time then
    return jsonb_build_object('ok', false, 'code', 'SAME_TIME');
  end if;
  if not exists (select 1 from public.wf_reserve_slots(b.place_id, p_date, b.party_size, b.id) s where s.slot = p_time) then
    return jsonb_build_object('ok', false, 'code', 'SLOT_FULL');
  end if;
  update public.wf_reserve_bookings
     set status = 'proposed', proposed_date = p_date, proposed_time = p_time, updated_at = now()
   where id = b.id
   returning * into b;
  return jsonb_build_object('ok', true, 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
end;
$fn$;

create function public.wf_reserve_respond_proposal(p_booking_id uuid, p_user_id uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  b public.wf_reserve_bookings%rowtype;
  peek public.wf_reserve_bookings%rowtype;
  pt public.wf_reserve_partners%rowtype;
begin
  if p_booking_id is null or p_user_id is null or p_accept is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into peek from public.wf_reserve_bookings where id = p_booking_id and user_id = p_user_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_accept and peek.proposed_date is not null then
    perform pg_advisory_xact_lock(hashtext('wf_reserve:' || peek.place_id));
  end if;
  select * into b from public.wf_reserve_bookings where id = p_booking_id and user_id = p_user_id for update;
  select * into pt from public.wf_reserve_partners where place_id = b.place_id;
  if b.status <> 'proposed' or b.proposed_date is null or b.proposed_time is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_PROPOSED', 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
  end if;
  if p_accept then
    if b.proposed_date is distinct from peek.proposed_date then
      return jsonb_build_object('ok', false, 'code', 'NOT_PROPOSED', 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
    end if;
    if not exists (select 1 from public.wf_reserve_slots(b.place_id, b.proposed_date, b.party_size, b.id) s where s.slot = b.proposed_time) then
      return jsonb_build_object('ok', false, 'code', 'SLOT_FULL', 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
    end if;
    update public.wf_reserve_bookings
       set reserve_date = proposed_date, reserve_time = proposed_time, status = 'confirmed',
           proposed_date = null, proposed_time = null, reminder_sent_at = null, updated_at = now()
     where id = b.id
     returning * into b;
  else
    update public.wf_reserve_bookings
       set status = 'cancelled', cancelled_by = 'guest', cancel_reason = 'declined new time',
           proposed_date = null, proposed_time = null, updated_at = now()
     where id = b.id
     returning * into b;
  end if;
  return jsonb_build_object('ok', true, 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
end;
$fn$;

revoke all on function public.wf_reserve_slots(text, date, int, uuid) from public, anon, authenticated;
revoke all on function public.wf_reserve_book(text, uuid, date, time, int, text, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.wf_reserve_cancel(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.wf_reserve_propose(uuid, text, date, time) from public, anon, authenticated;
revoke all on function public.wf_reserve_respond_proposal(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.wf_reserve_slots(text, date, int, uuid) to service_role;
grant execute on function public.wf_reserve_book(text, uuid, date, time, int, text, text, text, boolean, uuid) to service_role;
grant execute on function public.wf_reserve_cancel(uuid, text, uuid, text, text) to service_role;
grant execute on function public.wf_reserve_propose(uuid, text, date, time) to service_role;
grant execute on function public.wf_reserve_respond_proposal(uuid, uuid, boolean) to service_role;
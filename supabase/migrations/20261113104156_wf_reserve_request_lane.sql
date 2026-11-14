alter table public.wf_reserve_partners
  add column booking_mode text not null default 'instant' check (booking_mode in ('instant', 'request'));

alter table public.wf_reserve_bookings drop constraint wf_reserve_bookings_status_check;
alter table public.wf_reserve_bookings
  add constraint wf_reserve_bookings_status_check check (status in ('confirmed', 'cancelled', 'proposed', 'requested', 'declined'));

create or replace function public.wf_reserve_slots(p_place_id text, p_date date, p_party int, p_exclude uuid default null)
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
  select * into pt from public.wf_reserve_partners where place_id = p_place_id and active and booking_mode = 'instant';
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
          and b.status in ('confirmed', 'proposed')
          and b.reserve_date between p_date - 1 and p_date + 1
          and (p_exclude is null or b.id <> p_exclude)
          and (b.reserve_date + b.reserve_time) < c.ts + dur
          and c.ts < (b.reserve_date + b.reserve_time) + dur
      ), 0) + p_party <= pt.capacity_covers
    order by c.ts;
end;
$fn$;

create or replace function public.wf_reserve_book(
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
  if pt.booking_mode <> 'instant' then return jsonb_build_object('ok', false, 'code', 'REQUEST_ONLY'); end if;
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

  if exists (select 1 from public.wf_reserve_bookings where user_id = p_user_id and place_id = p_place_id and reserve_date = p_date and status not in ('cancelled', 'declined')) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end if;
  if (
    select count(*)
    from public.wf_reserve_bookings b
    join public.wf_reserve_partners bp on bp.place_id = b.place_id
    where b.user_id = p_user_id and b.status not in ('cancelled', 'declined')
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

create or replace function public.wf_reserve_cancel(
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
  if b.status in ('cancelled', 'declined') then
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

create function public.wf_reserve_request(
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
  if pt.booking_mode <> 'request' then return jsonb_build_object('ok', false, 'code', 'INSTANT_ONLY'); end if;
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

  if exists (select 1 from public.wf_reserve_bookings where user_id = p_user_id and place_id = p_place_id and reserve_date = p_date and status not in ('cancelled', 'declined')) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end if;
  if (
    select count(*)
    from public.wf_reserve_bookings b
    join public.wf_reserve_partners bp on bp.place_id = b.place_id
    where b.user_id = p_user_id and b.status not in ('cancelled', 'declined')
      and (b.reserve_date + b.reserve_time) >= (now() at time zone bp.timezone)
  ) >= 3 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;

  -- A request holds no seats: the restaurant decides. Nothing here claims availability.

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
         'requested', p_idem)
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

create function public.wf_reserve_respond_request(p_booking_id uuid, p_place_id text, p_accept boolean, p_reason text default null)
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
  if p_booking_id is null or p_place_id is null or p_accept is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtext('wf_reserve:' || p_place_id));
  select * into b from public.wf_reserve_bookings where id = p_booking_id and place_id = p_place_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into pt from public.wf_reserve_partners where place_id = b.place_id;
  if b.status <> 'requested' then
    return jsonb_build_object('ok', false, 'code', 'NOT_REQUESTED', 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
  end if;
  if p_accept and (b.reserve_date + b.reserve_time) <= (now() at time zone pt.timezone) then
    return jsonb_build_object('ok', false, 'code', 'TOO_LATE', 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
  end if;
  update public.wf_reserve_bookings
     set status = case when p_accept then 'confirmed' else 'declined' end,
         cancel_reason = case when p_accept then null else nullif(btrim(coalesce(p_reason, '')), '') end,
         reminder_sent_at = null, updated_at = now()
   where id = b.id
   returning * into b;
  return jsonb_build_object('ok', true, 'booking', to_jsonb(b) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone));
end;
$fn$;

revoke all on function public.wf_reserve_request(text, uuid, date, time, int, text, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.wf_reserve_respond_request(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.wf_reserve_request(text, uuid, date, time, int, text, text, text, boolean, uuid) to service_role;
grant execute on function public.wf_reserve_respond_request(uuid, text, boolean, text) to service_role;
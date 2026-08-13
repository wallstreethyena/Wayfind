-- 20260813_wf_promote_metros.sql
--
-- ONE source of truth for "which coordinates are inside a market Wayfind serves".
--
-- WHY THIS TABLE EXISTS. lib/promoteIndex.js already carries PROMOTE_METROS as a
-- JS constant, and the promotion decision now also has to be made inside the
-- database (the enqueue trigger fires on a Postgres write, not in Node). Two
-- copies of a geographic rule is exactly how a place ends up queued by one half
-- of the system and rejected by the other. So: the TABLE is authoritative, the JS
-- constant is the mirror, and scripts/check-promote-metros-parity.mjs fails the
-- build if they diverge.
--
-- WHY BOXES AND NOT A RADIUS. Copied verbatim from PROMOTE_METROS so this
-- migration changes nothing about which places are eligible -- it only moves the
-- rule somewhere SQL can read it. Boxes deliberately overlap (Tampa/St. Pete);
-- wf_bucket_metro breaks the tie by nearest box centre, identical to bucketMetro().
--
-- WHY IT MATTERS COMMERCIALLY. 20,215 places sit in the discovery index and
-- 13,155 of them are outside every served metro -- Istanbul, Bogota, Elk Grove,
-- places a user was near once. Promoting globally would flood the app with cards
-- in cities Wayfind cannot monetise and cannot honestly rank. This table is the
-- thing that stops that.

create table if not exists public.wf_promote_metros (
  metro    text primary key,
  min_lat  double precision not null,
  max_lat  double precision not null,
  min_lng  double precision not null,
  max_lng  double precision not null,
  active   boolean not null default true,
  added_at timestamptz not null default now(),
  constraint wf_promote_metros_lat_ck check (min_lat < max_lat),
  constraint wf_promote_metros_lng_ck check (min_lng < max_lng)
);

comment on table public.wf_promote_metros is
  'Authoritative promotion bounding boxes. Mirrors PROMOTE_METROS in lib/promoteIndex.js; parity is enforced by scripts/check-promote-metros-parity.mjs. Only places inside an active box are ever promoted into wf_inventory.';

insert into public.wf_promote_metros (metro, min_lat, max_lat, min_lng, max_lng) values
  ('manatee-sarasota', 27.02, 27.62, -82.72, -82.15),
  ('tampa',            27.60, 28.17, -82.75, -82.20),
  ('st-pete',          27.66, 27.98, -82.79, -82.55),
  ('orlando',          28.30, 28.75, -81.65, -81.10)
on conflict (metro) do update
  set min_lat = excluded.min_lat, max_lat = excluded.max_lat,
      min_lng = excluded.min_lng, max_lng = excluded.max_lng;

-- wf_bucket_metro -- the SQL twin of bucketMetro() in lib/promoteIndex.js.
-- Nearest ACTIVE box whose bounds contain the point; NULL when no box does.
-- STABLE (not IMMUTABLE): it reads a table, so it must never be used in an index
-- expression -- only in queries, triggers and functions.
create or replace function public.wf_bucket_metro(p_lat double precision, p_lng double precision)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.metro
    from public.wf_promote_metros m
   where m.active
     and p_lat is not null and p_lng is not null
     and p_lat between m.min_lat and m.max_lat
     and p_lng between m.min_lng and m.max_lng
   order by power(p_lat - (m.min_lat + m.max_lat) / 2, 2)
          + power(p_lng - (m.min_lng + m.max_lng) / 2, 2)
   limit 1
$$;

comment on function public.wf_bucket_metro(double precision, double precision) is
  'Nearest active promotion metro containing the point, or NULL. SQL twin of bucketMetro() in lib/promoteIndex.js -- the two must agree.';

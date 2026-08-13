-- 20260813_wf_geo_coverage.sql
--
-- WHY. wf_coverage_status(lat,lng) is not a coverage cache. It full-scans
-- wf_inventory ordered by squared euclidean distance and returns the single
-- nearest row within 75 miles. That answers "is there ANY card somewhere near
-- this person" -- which is true for the entire state of Florida and therefore
-- tells you nothing. It cannot answer the question that actually matters: "is
-- THIS neighbourhood thin, and how thin."
--
-- WHY GEOHASH AND NOT H3. Checked on this database (Postgres 17.6): postgis is
-- available but not installed, and the h3 extension is not available at all. A
-- geohash needs no extension, is a plain text prefix, indexes on a btree, and
-- gives free hierarchy -- precision 5 is a ~4.9 x 4.9 km cell, precision 4 is its
-- ~39 x 20 km parent, and the parent is just substr(cell, 1, 4). That is enough
-- resolution to say "Parrish is thin" without adding a dependency.
--
-- WHAT IT IS FOR. Cache-first, per the architecture rule: the app asks this table
-- whether an area is covered and never asks Google. When a cell is thin, the
-- answer is to enqueue promotion in the background (wf_promotion_backfill) and to
-- widen the radius honestly in the UI -- not to fire a live Places search on page
-- open.
--
-- MEASURED AT PARRISH ON THE DAY THIS SHIPPED: cell dhvku held 5 inventory cards
-- against 39 known places; the ~39km parent held 207 against 690. A 497-place
-- promotion gap, previously invisible.

-- wf_geohash -- standard base32 geohash. IMMUTABLE: pure arithmetic, no table
-- reads, so it is safe in an index expression and in a generated column.
-- Verified against three published reference values on apply:
--   (57.64911, 10.40744) p12 -> u4pruydqqvj8
--   (57.64911, 10.40744) p5  -> u4pru
--   (-25.382708, -49.265506) p8 -> 6gkzwgjz
create or replace function public.wf_geohash(
  p_lat       double precision,
  p_lng       double precision,
  p_precision integer default 5
)
returns text
language plpgsql
immutable
as $$
declare
  b32     constant text := '0123456789bcdefghjkmnpqrstuvwxyz';
  lat_min double precision := -90;
  lat_max double precision :=  90;
  lng_min double precision := -180;
  lng_max double precision :=  180;
  mid     double precision;
  is_lng  boolean := true;   -- geohash interleaves longitude first
  bits    integer := 0;
  ch      integer := 0;
  want    integer := greatest(1, least(coalesce(p_precision, 5), 12));
  out     text := '';
begin
  if p_lat is null or p_lng is null then return null; end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then return null; end if;

  while length(out) < want loop
    if is_lng then
      mid := (lng_min + lng_max) / 2;
      if p_lng > mid then ch := ch * 2 + 1; lng_min := mid; else ch := ch * 2; lng_max := mid; end if;
    else
      mid := (lat_min + lat_max) / 2;
      if p_lat > mid then ch := ch * 2 + 1; lat_min := mid; else ch := ch * 2; lat_max := mid; end if;
    end if;
    is_lng := not is_lng;
    bits := bits + 1;
    if bits = 5 then
      out  := out || substr(b32, ch + 1, 1);
      bits := 0;
      ch   := 0;
    end if;
  end loop;

  return out;
end $$;

comment on function public.wf_geohash(double precision, double precision, integer) is
  'Base32 geohash. Precision 5 = ~4.9km cell, 4 = ~39km parent (substr(cell,1,4)). No extension required - h3 is unavailable on this instance and postgis is not installed.';

create table if not exists public.wf_geo_coverage (
  cell            text primary key,
  cell4           text not null,
  metro           text,
  inventory_count integer not null default 0,
  staged_count    integer not null default 0,
  queued_count    integer not null default 0,
  center_lat      double precision,
  center_lng      double precision,
  computed_at     timestamptz not null default now()
);

comment on table public.wf_geo_coverage is
  'Precomputed inventory density per ~4.9km geohash cell. Read this to decide whether an area is thin; never call Google to answer that question on a page load.';
comment on column public.wf_geo_coverage.staged_count is
  'Places known in wf_place_ids for this cell. staged_count >> inventory_count is the promotion gap made visible.';

create index if not exists wf_geo_coverage_cell4_idx  on public.wf_geo_coverage (cell4);
create index if not exists wf_geo_coverage_metro_idx  on public.wf_geo_coverage (metro);

-- Full recompute. Cheap (three grouped scans over ~24k rows) and correct -- an
-- incremental version would drift the moment a row's coordinates change.
create or replace function public.wf_refresh_geo_coverage(p_precision integer default 5)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0;
begin
  with inv as (
    select public.wf_geohash(lat, lng, p_precision) cell,
           count(*) c, avg(lat) la, avg(lng) ln,
           mode() within group (order by metro) mt
      from public.wf_inventory
     where lat is not null and lng is not null and status = 'OPERATIONAL'
     group by 1
  ), stg as (
    select public.wf_geohash(lat, lng, p_precision) cell, count(*) c, avg(lat) la, avg(lng) ln
      from public.wf_place_ids
     where lat is not null and lng is not null
     group by 1
  ), q as (
    select public.wf_geohash(p.lat, p.lng, p_precision) cell, count(*) c
      from public.wf_promotion_queue qq
      join public.wf_place_ids p on p.place_id = qq.place_id
     where qq.status in ('pending', 'working') and p.lat is not null and p.lng is not null
     group by 1
  ), merged as (
    select coalesce(inv.cell, stg.cell) cell,
           coalesce(inv.c, 0) invc,
           coalesce(stg.c, 0) stgc,
           coalesce(q.c, 0)   qc,
           coalesce(inv.la, stg.la) la,
           coalesce(inv.ln, stg.ln) ln,
           inv.mt
      from inv
      full outer join stg on stg.cell = inv.cell
      left  join q        on q.cell   = coalesce(inv.cell, stg.cell)
     where coalesce(inv.cell, stg.cell) is not null
  )
  insert into public.wf_geo_coverage
    (cell, cell4, metro, inventory_count, staged_count, queued_count, center_lat, center_lng, computed_at)
  select cell, substr(cell, 1, 4),
         coalesce(mt, public.wf_bucket_metro(la, ln)),
         invc, stgc, qc, la, ln, now()
    from merged
  on conflict (cell) do update
     set cell4           = excluded.cell4,
         metro           = excluded.metro,
         inventory_count = excluded.inventory_count,
         staged_count    = excluded.staged_count,
         queued_count    = excluded.queued_count,
         center_lat      = excluded.center_lat,
         center_lng      = excluded.center_lng,
         computed_at     = now();
  get diagnostics n = row_count;

  -- Every cell touched above carries computed_at = now() (transaction time), so
  -- anything strictly older was not produced by this run: the cell has genuinely
  -- emptied and must not linger as phantom coverage.
  delete from public.wf_geo_coverage g where g.computed_at < now();

  return n;
end $$;

-- wf_coverage_at -- the cache-first read. O(1) on the cell, plus the parent
-- aggregate so a thin cell inside a dense area is not misread as a dead zone.
-- Replaces wf_coverage_status for the "is this area covered" question; the old
-- function keeps working for anything already calling it.
create or replace function public.wf_coverage_at(p_lat double precision, p_lng double precision)
returns table (
  cell            text,
  metro           text,
  inventory_count integer,
  staged_count    integer,
  queued_count    integer,
  area_inventory  integer,
  area_staged     integer,
  promotion_gap   integer,
  served          boolean,
  computed_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.wf_geohash(p_lat, p_lng, 5) c)
  select me.c,
         coalesce(g.metro, public.wf_bucket_metro(p_lat, p_lng)),
         coalesce(g.inventory_count, 0),
         coalesce(g.staged_count, 0),
         coalesce(g.queued_count, 0),
         coalesce((select sum(a.inventory_count)::integer from public.wf_geo_coverage a where a.cell4 = substr(me.c, 1, 4)), 0),
         coalesce((select sum(a.staged_count)::integer    from public.wf_geo_coverage a where a.cell4 = substr(me.c, 1, 4)), 0),
         coalesce((select sum(greatest(a.staged_count - a.inventory_count, 0))::integer
                     from public.wf_geo_coverage a where a.cell4 = substr(me.c, 1, 4)), 0),
         public.wf_bucket_metro(p_lat, p_lng) is not null,
         g.computed_at
    from me left join public.wf_geo_coverage g on g.cell = me.c
$$;

comment on function public.wf_coverage_at(double precision, double precision) is
  'Cache-first coverage answer for a point: this cell, its ~39km parent, and the promotion gap. Read this instead of full-scanning wf_inventory or calling Google.';

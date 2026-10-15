-- 20261015130000_wf_inventory_independent_coords.sql
-- ADDITIVE ONLY. The column lib/coordProvenance.js (#1772) anticipates:
-- wf_inventory.independent_coords, a jsonb ARRAY of sourced coordinates.
--
--   [{ "source":      "google_places" | "osm" | "wikidata" | "fsq_os_places" | "official_venue" | "owner_verified",
--      "lat": <number>, "lng": <number>,
--      "observed_at": "<ISO-8601>",   -- REQUIRED for google_places (30-day clock)
--      "attribution": "<text>"|null,  -- the licence credit the pin must show
--      "verified":    true|false,
--      "method":      "<how obtained, e.g. wf_place_ids-sighting | osm-name-match>",
--      "ref":         "<source object id, e.g. node/123>" }]
--
-- Nullable, no default, no backfill, no policy/grant change (a new column
-- inherits the table's existing ACL and RLS). Which sources may be drawn, and
-- for how long, is decided ONLY by lib/coordProvenance.js; this column stores
-- candidates, it does not grant permission. A google_places entry is honoured
-- only with method 'wf_place_ids-sighting' and an honest observed_at, and
-- expires 30 days after that observation by policy.
--
-- The CHECK keeps the shape an array (or null). The partial index serves the
-- map prefilter `independent_coords is not null`.
alter table public.wf_inventory
  add column if not exists independent_coords jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wf_inventory'::regclass and conname = 'wf_inventory_independent_coords_is_array'
  ) then
    alter table public.wf_inventory
      add constraint wf_inventory_independent_coords_is_array
      check (independent_coords is null or jsonb_typeof(independent_coords) = 'array');
  end if;
end $$;

create index if not exists wf_inventory_independent_coords_present_idx
  on public.wf_inventory (place_id)
  where independent_coords is not null;

comment on column public.wf_inventory.independent_coords is
  'Array of sourced map coordinates {source,lat,lng,observed_at,attribution,verified,method,ref}. Drawability is decided only by lib/coordProvenance.js (per-source licence/age policy). Nullable; no backfill.';

-- Reader-facing inventory requests always constrain one physical category and
-- a latitude/longitude bounding box before applying the exact distance gate.
-- The former indexes split those predicates between (metro, category) and
-- (lat, lng), so a cold cell could still scan a large category or merge broad
-- bitmaps before LIMIT 1000. Put the equality column first, followed by the
-- range columns in the same order used by lib/inventoryServe.js.
--
-- This is deliberately a plain index rather than a partial "operational"
-- index: status/excluded are compatibility-filtered in application code and
-- are not guaranteed to appear in the SQL predicate on every schema version,
-- so Postgres could not legally choose a partial index for those reads.
create index if not exists wf_inventory_category_geo_bounds_idx
  on public.wf_inventory (category, lat, lng);

comment on index public.wf_inventory_category_geo_bounds_idx is
  'Supports bounded reader inventory queries by category + latitude/longitude; exact radius and quality gates remain in application code.';

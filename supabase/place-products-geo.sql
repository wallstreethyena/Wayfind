-- supabase/place-products-geo.sql
--
-- Constrain wf_place_products' Viator half to products in the place's OWN
-- Viator destination. Audit finding F1' (2026-08-02).
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────────
-- The view joined wf_inventory to wf_experiences on a bare name substring
--   e.title ILIKE '%' || i.name || '%'   (min 6 chars)
-- with NO geographic constraint of any kind. /api/place-products serves rn=1
-- from this view, and the place-card booking button renders ONLY for a place
-- that comes back — "no verified product, no button". So 7 of 43 live Viator
-- booking buttons (16.3%) sent users to a product in the wrong city.
--
-- This is the wrong-place class lib/bookingResolver.js keeps geoConfirms() for,
-- occurring in SQL where that guard cannot reach it. Measured offenders:
--
--   Central Park (Winter Park, Orlando) -> NYC Central Park photography tour
--   Subway (Sarasota — a sandwich shop) -> "Hidden Subway Secrets Below Manhattan"
--   Munchies (Orlando)                  -> Clearwater Beach bachelorette tour
--   Avalon (Orlando)                    -> Clearwater boat charter
--   Otherworld (Columbus OH)            -> Orlando ghost tour
--   Riverwalk (Bradenton)               -> Tampa Riverwalk food tour
--
-- ── WHY DISTANCE, NOT THE METRO TAG ────────────────────────────────────────
-- The obvious fix keys on wf_inventory.metro. It is unreliable, and measurably
-- so: "Fort De Soto Park" is tagged manatee-sarasota while "Fort De Soto" two
-- miles away is tagged tampa, and "The Florida Aquarium" — 0.9 miles from
-- Tampa's centre — is tagged bogot-cundinamarca. A metro-keyed version was
-- built first and destroyed BOTH of those correct matches (8 lost, 1 of them
-- legitimate).
--
-- wf_inventory carries real coordinates on all 3,457 rows, so the join keys on
-- distance from the place to its product's destination centre instead. Both
-- correct matches survive, and the bad metro tags stop mattering.
--
-- wf_experiences has NO coordinates (0 of 1,242), which is why the distance is
-- measured to the destination CENTRE rather than to the product itself.
--
-- ── WHY 25 MILES ───────────────────────────────────────────────────────────
-- Measured, not chosen. The two populations separate cleanly with an empty gap:
--
--   correct   Tampa Riverwalk 0.4 · Florida Aquarium 0.9 · Navy Pier 1.6
--             · Fort De Soto Park 10.6
--   wrong     Bradenton Riverwalk -> Tampa 32.0 · Munchies 88.7 · Avalon 96.3
--             · Otherworld 790.9 · Central Park 934.5 · Subway 1052.4
--
-- 25 sits inside the 10.6 -> 32.0 gap. If a future market legitimately spans
-- more than 25 miles from its destination centre, RE-MEASURE before widening —
-- the gap is the evidence, not the number.
--
-- ── MEASURED EFFECT ────────────────────────────────────────────────────────
--   rendered booking buttons (rn=1)   58 -> 52
--   viator                            42 -> 36   (exactly the 6 wrong above)
--   undercover_tourist                16 -> 16   (untouched)
--   gained                            0
--
-- The undercover_tourist branch is deliberately unchanged: it had ZERO
-- mismatches because it joins on an explicit curated maps_to key rather than
-- guessing from a name. That is the shape the Viator half should grow toward;
-- this change buys correctness now without waiting for that.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Re-create the view with the viator branch as:
--     FROM wf_inventory i
--     JOIN wf_experiences e
--       ON COALESCE(e.link_ok, true) AND length(i.name) >= 6
--      AND e.title ILIKE ('%' || i.name || '%')
-- i.e. drop the wf_viator_dests join and the distance predicate. The
-- wf_viator_dests table can be left in place; nothing else reads it.

BEGIN;

CREATE TABLE IF NOT EXISTS wf_viator_dests (
  dest_id text PRIMARY KEY,
  city    text NOT NULL,
  lat     double precision NOT NULL,
  lng     double precision NOT NULL
);

COMMENT ON TABLE wf_viator_dests IS
  'Viator destination centres, used to prove a product belongs to the same place as the venue it is matched to in wf_place_products. Mirrors DESTS in lib/experiencesData.js for the 5 Florida markets; the rest are city centres for destinations already present in wf_experiences.';

INSERT INTO wf_viator_dests (dest_id, city, lat, lng) VALUES
  ('25738', 'Sarasota',       27.336,  -82.531),
  ('5403',  'St. Petersburg', 27.771,  -82.640),
  ('22457', 'Clearwater',     27.966,  -82.800),
  ('666',   'Tampa',          27.951,  -82.457),
  ('663',   'Orlando',        28.538,  -81.379),
  ('5560',  'New York',       40.7128, -74.0060),
  ('673',   'Chicago',        41.8781, -87.6298),
  ('585',   'Istanbul',       41.0082,  28.9784),
  ('828',   'Dubai',          25.2048,  55.2708),
  ('4560',  'Bogotá',          4.7110, -74.0721),
  ('50300', 'San Juan',       18.4655, -66.1057),
  ('23485', 'Columbus',       39.9612, -82.9988)
ON CONFLICT (dest_id) DO UPDATE
  SET city = EXCLUDED.city, lat = EXCLUDED.lat, lng = EXCLUDED.lng;

-- Public reference data (city centres). RLS on with an explicit read policy
-- rather than left off — a table with RLS disabled is how the earlier anon
-- read-exposure P0 happened, and "it is only coordinates" is exactly the
-- reasoning that let it through.
ALTER TABLE wf_viator_dests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_viator_dests_anon_read ON wf_viator_dests;
CREATE POLICY wf_viator_dests_anon_read ON wf_viator_dests FOR SELECT USING (true);

CREATE OR REPLACE VIEW wf_place_products AS
SELECT place_id,
       provider,
       product_title,
       product_url,
       quality10,
       row_number() OVER (PARTITION BY place_id ORDER BY priority, quality10 DESC NULLS LAST) AS rn
FROM (
  -- Undercover Tourist: joins on the curated maps_to key, not a name guess.
  -- Zero mismatches measured; deliberately unchanged.
  SELECT i.place_id,
         'undercover_tourist'::text AS provider,
         d.title                    AS product_title,
         d.affiliate_url            AS product_url,
         d.quality10                AS quality10,
         1                          AS priority
    FROM wf_inventory i
    JOIN wf_deals d
      ON d.category = 'attractions'::text
     AND COALESCE(d.link_ok, false)
     AND i.name ILIKE ('%' || d.maps_to || '%')

  UNION ALL

  -- Viator: the name must match AND the place must sit within 25 miles of the
  -- centre of the destination the product belongs to.
  SELECT i.place_id,
         'viator'::text AS provider,
         e.title        AS product_title,
         e.product_url  AS product_url,
         NULL::numeric  AS quality10,
         2              AS priority
    FROM wf_inventory i
    JOIN wf_experiences e
      ON COALESCE(e.link_ok, true)
     AND length(i.name) >= 6
     AND e.title ILIKE ('%' || i.name || '%')
    JOIN wf_viator_dests v
      ON v.dest_id = e.dest_id
   WHERE i.lat IS NOT NULL
     AND i.lng IS NOT NULL
     AND 3958.8 * 2 * asin(sqrt(
           power(sin(radians(v.lat - i.lat) / 2), 2)
         + cos(radians(i.lat)) * cos(radians(v.lat))
         * power(sin(radians(v.lng - i.lng) / 2), 2)
         )) <= 25
) m;

COMMIT;

-- ── VERIFY AFTER APPLYING ──────────────────────────────────────────────────
-- Expect 52 total / 36 viator / 16 undercover_tourist, and ZERO rows from the
-- second query. A non-empty second result means a wrong-city button survived.
--
--   SELECT provider, count(*) FROM wf_place_products WHERE rn = 1
--   GROUP BY provider ORDER BY provider;
--
--   SELECT i.name, i.metro, v.city AS product_city,
--          round((3958.8 * 2 * asin(sqrt(
--            power(sin(radians(v.lat - i.lat) / 2), 2)
--          + cos(radians(i.lat)) * cos(radians(v.lat))
--          * power(sin(radians(v.lng - i.lng) / 2), 2))))::numeric, 1) AS miles
--     FROM wf_place_products p
--     JOIN wf_inventory i ON i.place_id = p.place_id
--     JOIN wf_experiences e ON e.title = p.product_title
--     JOIN wf_viator_dests v ON v.dest_id = e.dest_id
--    WHERE p.rn = 1 AND p.provider = 'viator'
--      AND 3958.8 * 2 * asin(sqrt(
--            power(sin(radians(v.lat - i.lat) / 2), 2)
--          + cos(radians(i.lat)) * cos(radians(v.lat))
--          * power(sin(radians(v.lng - i.lng) / 2), 2))) > 25;

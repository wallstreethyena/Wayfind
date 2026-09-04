-- scripts/data/menu-taxonomy-repair-2026-09-02.sql
--
-- Menu taxonomy audit (owner, 2026-09-02): "there's a lot of places that
-- don't belong in a menu now." Class D of the audit is a DATA defect, not
-- just a code one: lib/placeCategory.js's sectionFromPrimary() Food branch
-- never named acai_shop/pastry_shop/salad_shop/kebab_shop/noodle_shop as
-- Google primaryTypes (fixed separately in code — see the Food branch of
-- sectionFromPrimary() in lib/placeCategory.js), so every row seeded with one
-- of those primary_types before the code fix was mis-shelved under
-- category='shopping' and has been showing up on the Shopping menu instead
-- of Food ever since. The code fix only changes classify() for FUTURE
-- ingests/re-classifications; it does not touch rows already sitting in the
-- table with a stale stored `category`. This file is the one-time backfill.
--
-- EVIDENCE (live, gbhtoehdxkzjsmmkisgu, queried 2026-09-02):
--   SELECT primary_type, category, count(*) FROM wf_inventory
--   WHERE primary_type IN ('acai_shop','pastry_shop','salad_shop','kebab_shop','noodle_shop')
--   GROUP BY primary_type, category ORDER BY primary_type;
--
--     primary_type | category | count
--     -------------+----------+------
--     acai_shop    | shopping |   41
--     kebab_shop   | shopping |    1
--     noodle_shop  | shopping |    2
--     pastry_shop  | food     |    2   <- already correct, left untouched
--     pastry_shop  | shopping |   17
--     salad_shop   | food     |    1   <- already correct, left untouched
--     salad_shop   | shopping |    6
--
--   67 rows total need the category flip (41+1+2+17+6). Example offenders
--   (all currently category='shopping'): "Dream Earth Bowl Cafe" (acai_shop),
--   "Raining Berries - Southside Village Sarasota" (acai_shop), "Oakberry
--   Acai" (acai_shop), "Le Macaron French Pastries" (pastry_shop), "Vincent's
--   French Bakery" (pastry_shop), "King Kabab" (kebab_shop), "SLAP Hand
--   Ripped Noodles" (noodle_shop), "Token Ramen & KungFu Tea Sarasota"
--   (noodle_shop).
--
-- SCOPE: only rows whose primary_type is one of these five AND whose
-- category is currently 'shopping' are touched — the 3 already-correct
-- pastry_shop/salad_shop food rows are left alone by the WHERE clause below.
--
-- IDEMPOTENT: each UPDATE's WHERE re-checks category='shopping', so running
-- this file twice is a no-op the second time (0 rows matched).
--
-- NOT RUN. Per the work order, this file is produced for the owner's review
-- and manual execution — this audit does not write to the database.

BEGIN;

-- acai_shop: 41 rows
UPDATE wf_inventory
   SET category = 'food'
 WHERE primary_type = 'acai_shop'
   AND category = 'shopping';

-- pastry_shop: 17 rows (2 already-correct food rows untouched by this WHERE)
UPDATE wf_inventory
   SET category = 'food'
 WHERE primary_type = 'pastry_shop'
   AND category = 'shopping';

-- salad_shop: 6 rows (1 already-correct food row untouched by this WHERE)
UPDATE wf_inventory
   SET category = 'food'
 WHERE primary_type = 'salad_shop'
   AND category = 'shopping';

-- kebab_shop: 1 row
UPDATE wf_inventory
   SET category = 'food'
 WHERE primary_type = 'kebab_shop'
   AND category = 'shopping';

-- noodle_shop: 2 rows
UPDATE wf_inventory
   SET category = 'food'
 WHERE primary_type = 'noodle_shop'
   AND category = 'shopping';

COMMIT;

-- Verification query to run after applying, expected: zero rows returned.
--   SELECT primary_type, category, count(*) FROM wf_inventory
--   WHERE primary_type IN ('acai_shop','pastry_shop','salad_shop','kebab_shop','noodle_shop')
--     AND category = 'shopping'
--   GROUP BY primary_type, category;

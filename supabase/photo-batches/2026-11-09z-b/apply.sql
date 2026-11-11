-- Photo batch 2026 11z-b: Christmas cards that showed the drawn tile.
-- Every photo is a static event gallery file in the repo
-- (lib/christmasStaticGalleryAdditions.js). None of these listings has a
-- place row, so no database row changes. This file only reads, as a guard
-- record that no wf_inventory row is involved.
select count(*) as rows_touched from wf_inventory where false;

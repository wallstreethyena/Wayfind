-- Photo batch 2026 12a: Christmas cards that showed only a Google venue shot
-- or had fewer than 7 photos. Every photo is a static event gallery file in
-- the repo (lib/christmasStaticGalleryAdditions.js). No wf_inventory row
-- changes. This file only reads, as a guard record that no place row is
-- involved.
select count(*) as rows_touched from wf_inventory where false;

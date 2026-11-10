-- Photo batch 2026 11z: Boat Parades and Coastal Traditions shelf.
-- Every photo in this batch is a static event gallery file shipped in the repo
-- (lib/christmasStaticGalleryAdditions.js). No wf_inventory or wf_events row
-- changes, so this file only reads. The guard reports the current photo
-- counts of the two linked place rows so a later run can confirm nothing moved.
select place_id,
       jsonb_array_length(coalesce(signals->'photos','[]'::jsonb)) as photo_count,
       jsonb_array_length(coalesce(signals->'photo_gallery','[]'::jsonb)) as gallery_count
from wf_inventory
where place_id in ('ChIJTWrh3YjEwogRZMvFcYsYXxg','ChIJHxcB0vPEwogR3fFnuF_MWmg')
order by place_id;

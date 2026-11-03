-- Dracula's Legacy: the two cards are NOT duplicates. They are the brand's two real locations
-- (draculaslegacywinebar.com lists a Tampa location and a St. Petersburg location):
--   ChIJIZt3d7DFwogRQ5Lg2tPMXyk  "Dracula's Legacy Wine Bar & Bistro Tampa"  metro tampa     27.9509, -82.4601  39 events rows
--   ChIJw8yuv53hwogRivnj0XblR-k  "Dracula's Legacy Wine Bar & Bistro"        metro st-pete   27.7741, -82.6336  24 events rows
-- Each has its own wf_editorial, wf_place_photo, wf_google_photo_store and wf_place_ids row. Nothing should be merged
-- or excluded. The only fix is naming: the St. Petersburg card carries the bare brand name, so it reads like a copy
-- of the Tampa card. This renames it to match the Tampa card's pattern. Idempotent. Undo: fix_dracula_undo.sql.
begin;
update wf_inventory
   set name = 'Dracula''s Legacy Wine Bar & Bistro St. Petersburg'
 where place_id = 'ChIJw8yuv53hwogRivnj0XblR-k'
   and name = 'Dracula''s Legacy Wine Bar & Bistro';
commit;

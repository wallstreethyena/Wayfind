-- 20261119130000_wf_inventory_junk_metro_relabels.sql
-- Owner-approved 2026-11-19 (full audit follow-up: "fix all P2 till P3s").
--
-- Two OPERATIONAL Florida rows carry junk metro keys left by out-of-state
-- ingestion clusters (same failure class as the Broward relabel, #2612):
--   ChIJoytkFemd5ogR95zNthdToRo  Castillo Real St. Augustine Beach Resort
--     (St. Augustine Beach, St. Johns County, 29.8509,-81.2669)
--     metro 'city-37.3--85.4' (a Kentucky coordinate key) -> 'st-augustine-fl'
--     (the key every other St. Johns row uses)
--   ChIJ1YQwOFjZ5ogRWTiUPYUDU_Q  Daytona Aquarium & Rainforest Adventure
--     (Daytona Beach, Volusia County, 29.2035,-81.0418)
--     metro 'boardman-or' (Boardman, Oregon) -> 'florida'
--     (the key sibling Daytona/Volusia rows use)
-- Only metro changes; each update is compare-and-set on the old label and county.
-- Rollback: set metro back to 'city-37.3--85.4' / 'boardman-or' for these two place_ids.

begin;

update public.wf_inventory set metro = 'st-augustine-fl'
 where place_id = 'ChIJoytkFemd5ogR95zNthdToRo' and metro = 'city-37.3--85.4' and county = 'St. Johns';

update public.wf_inventory set metro = 'florida'
 where place_id = 'ChIJ1YQwOFjZ5ogRWTiUPYUDU_Q' and metro = 'boardman-or' and county = 'Volusia';

do $$
begin
  if (select count(*) from public.wf_inventory
       where (place_id = 'ChIJoytkFemd5ogR95zNthdToRo' and metro = 'st-augustine-fl')
          or (place_id = 'ChIJ1YQwOFjZ5ogRWTiUPYUDU_Q' and metro = 'florida')) <> 2 then
    raise exception 'junk metro relabel: expected both rows relabeled; rolled back';
  end if;
end $$;

commit;

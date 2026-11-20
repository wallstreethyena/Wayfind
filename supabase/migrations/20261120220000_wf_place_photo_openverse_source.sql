-- wf_place_photo: allow the second free licensed source, Openverse (2026-11-20).
--
-- Owner decision 2026-11-20: fill photo gaps from free licensed sources, no
-- Google spend. lib/openversePhotos.js finds Creative Commons photos (CC BY,
-- CC BY-SA, CC0, Public Domain Mark only) whose title names the exact place
-- and town; lib/openverseBackfill.js vaults them into Wayfind storage before
-- they are ever served.
--
-- Schema impact: widens the existing source CHECK by one value. No data is
-- rewritten; every existing row still satisfies it. Permissions/RLS: none
-- changed. lib/photoLicense.js STORABLE_SOURCES gains the same value in the
-- same PR (the array and this constraint must never drift).
-- Rollback: delete source='openverse' rows (they only exist after this lane
-- runs) and restore the three-value CHECK below.
-- Ordering: apply BEFORE the code that writes source='openverse' deploys;
-- until then that lane's writes would fail the CHECK and it records nothing.
alter table public.wf_place_photo drop constraint if exists wf_place_photo_source_check;
alter table public.wf_place_photo
  add constraint wf_place_photo_source_check
  check (source = any (array['wikimedia'::text, 'owner'::text, 'creator'::text, 'openverse'::text]));

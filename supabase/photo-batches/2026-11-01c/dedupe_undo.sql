-- Put back signals.photos and signals.photo_gallery for every row
-- dedupe.sql snapshotted, using that snapshot.
-- Safe to run more than once. Leaves the snapshot table in place.

begin;

update public.wf_inventory i
set signals = jsonb_set(
  jsonb_set(coalesce(i.signals, '{}'::jsonb), '{photos}', coalesce(b.photos, '[]'::jsonb)),
  '{photo_gallery}',
  coalesce(b.photo_gallery, '[]'::jsonb)
)
from public.wf_photo_url_dedupe_backup_20261101c b
where i.place_id = b.place_id
  and (
    i.signals->'photos' is distinct from b.photos
    or i.signals->'photo_gallery' is distinct from b.photo_gallery
  );

commit;

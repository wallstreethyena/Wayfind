-- Put back signals.photo_gallery for every row
-- fix_cover_order.sql snapshotted, using that snapshot.
-- Safe to run more than once. Leaves the snapshot table in place.

begin;

update public.wf_inventory i
set signals = jsonb_set(i.signals, '{photo_gallery}', b.photo_gallery)
from public.wf_photo_gallery_order_backup_20261101 b
where i.place_id = b.place_id
  and i.signals->'photo_gallery' is distinct from b.photo_gallery;

commit;

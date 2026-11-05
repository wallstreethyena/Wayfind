-- undo for batch 2026 11l: removes photos and photo_gallery only where they still point at batch-2026-11l.
begin;
update wf_inventory set signals = signals - 'photos' - 'photo_gallery' where place_id = 'ChIJUVX3MWXEwogRMmHunvjE6xY' and signals->>'photos' like '%batch-2026-11l%';
update wf_inventory set signals = signals - 'photos' - 'photo_gallery' where place_id = 'ChIJ9dh8n7fBwogRipsriopCrRc' and signals->>'photos' like '%batch-2026-11l%';
commit;

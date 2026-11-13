-- 20261111150000_scrub_legacy_google_photo_names.sql
--
-- WHY. The 2026-10-08 compliance change (#1697) stopped writing Google photo
-- names, but two stores still held names written before it (re-measured on
-- production 2026-11-11):
--   * wf_photo_repair_queue: 545 rows whose recovery_source is a cache rung
--     ('exact-ref-cache' / 'same-place-cache') hold a real Google photo name in
--     recovery_ref (544) and a copy of it plus the photo's author credit in
--     attribution. The photo|<name> cache rows those recoveries pointed at were
--     deleted in October, so nothing can serve them; only the names remain.
--   * wf_places_cache: 10,547 imgscore|<real photo name>|… keys (scores only,
--     every one expired by 2026-10-07, never deleted).
-- Google Place Photos: "You cannot cache a photo name"; Maps Platform Terms
-- 3.2.3 (no pre-fetch / store / cache beyond the allowed exceptions).
--
-- WHAT. Spend-neutral and status-neutral:
--   * recovery_ref becomes the place-only pseudo-ref
--     places/<id>/photos/wfplacediscovery (the shape lib/discoveryRef.js
--     writes), and the Google attribution copy is cleared. status is NOT
--     changed: reopening would send these rows back to the repair worker.
--   * the expired imgscore rows keyed by a real name are deleted.
-- Licensed (Wikimedia/owned) and google-stored rows are untouched.
--
-- IDEMPOTENT: every predicate only matches a row that still holds a real name
-- or a Google attribution copy; a second run changes 0 rows.

update public.wf_photo_repair_queue
set recovery_ref = case
      when recovery_ref ~ '^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$'
        then regexp_replace(recovery_ref, '^(places/[A-Za-z0-9_-]+/photos/)[A-Za-z0-9_-]+$', '\1wfplacediscovery')
      else recovery_ref
    end,
    attribution = null,
    updated_at = now()
where recovery_source in ('exact-ref-cache', 'same-place-cache')
  and (
    (recovery_ref ~ '^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$' and recovery_ref !~ '/photos/wfplacediscovery$')
    or attribution is not null
  );

delete from public.wf_places_cache
where k like 'imgscore|%'
  and k ~ 'places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]{20,}'
  and k !~ '/photos/wfplacediscovery';

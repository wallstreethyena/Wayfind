-- wf_place_photo_vault — the storage half of the permanent photo vault
-- (2026-09-09). Adds Wayfind's OWN copy of a photo's bytes on top of
-- 20260909_wf_place_photo.sql's origin-url record, a public bucket to hold
-- those bytes, and the worklist that lets the backfill beat the cliff.
--
-- THE OWNER'S RULE, VERBATIM IN INTENT: "Anything we get from somewhere that
-- costs, we store permanently, we don't want to lose it." The correct
-- implementation is a PROCUREMENT rule, not a hoarding one: Wayfind stores
-- what it is LICENSED to keep, and prefers providers whose licence allows
-- that going forward. lib/photoLicense.js's mayStorePermanently is the code
-- that enforces this — it refuses a Google-sourced photo BY NAME (Google's
-- Places terms permit caching a place_id indefinitely and lat/lng for 30
-- days; photos are NOT among the caching exceptions — AGENTS.md §8, the same
-- position 20260908_wf_photo_repair_queue.sql and lib/commonsPhotos.js
-- already document) and refuses anything whose licence it cannot verify as
-- free. lib/photoVault.js calls that gate before any network request, so a
-- Google photo byte can never reach this bucket.
--
-- MEASURED FACTS (production, 2026-09-09). wf_places_cache holds 10,028
-- Google photo rows covering 5,238 distinct places (multiple widths per
-- place), every one expiring between 2026-09-25 and 2026-10-04; 2,729 rows
-- die on 2026-09-25 alone. wf_spend_ledger's `photos` counter sits at
-- 950/950 for 2026-09, untouched since 2026-09-01 — there is zero headroom
-- left to re-buy any of them this month. By category, the at-risk places
-- are: food 2,634 · attractions 1,586 · nightlife 499 · not-in-inventory 248
-- · hotels 120 · beach 76 · shopping 75. Wayfind also has an open ~$1,878
-- Google billing dispute, which is the second, independent reason no Google
-- photo byte belongs in a table this migration makes permanent.
--
-- (a) STORAGE COLUMNS on wf_place_photo. image_url stays exactly what it was
--     — the ORIGIN url, kept for provenance and attribution display.
--     storage_path is Wayfind's own copy, written once by
--     lib/photoVault.js's storePhotoPermanently after it downloads the bytes
--     exactly once (idempotent — a row that already has a storage_path is
--     never re-downloaded or re-uploaded).
--
-- (b) A PUBLIC storage bucket, `place-photos`, service_role-write /
--     public-read — a photo Wayfind owns outright is meant to be served
--     directly from Storage's public CDN path, not re-proxied through a
--     signed URL.
--
-- (c) wf_photo_at_risk — one row per place that (i) has a cached Google
--     photo about to expire in wf_places_cache and (ii) has NO active vault
--     row on wf_place_photo yet, ordered by earliest expiry so the backfill
--     works the closest cliff first. The place id is embedded in the cache
--     key itself (`photo|places/<placeId>/photos/<photoId>|<width>`) — no
--     new column or index needed to recover it.

-- ── (a) storage columns ─────────────────────────────────────────────────
alter table public.wf_place_photo
  add column if not exists storage_path text;

alter table public.wf_place_photo
  add column if not exists stored_at timestamptz;

alter table public.wf_place_photo
  add column if not exists bytes integer;

alter table public.wf_place_photo
  add column if not exists content_type text;

comment on column public.wf_place_photo.storage_path is
  'Path of Wayfind''s OWN copy of this photo inside the place-photos storage bucket (e.g. "<place_id>/<sha256-prefix><ext>"), written once by lib/photoVault.js storePhotoPermanently after it downloads image_url''s bytes exactly one time. Null until stored -- a wf_place_photo row with source/license/image_url but no storage_path has been resolved by the ingestion lane but not yet copied into permanent storage. Never re-derived: a row that already has one is returned as-is (idempotent), never re-fetched.';
comment on column public.wf_place_photo.stored_at is
  'When storage_path was written. Distinct from verified_at (identity/license verification time) and created_at (row creation) -- this is specifically "when did Wayfind take its own copy of the bytes".';
comment on column public.wf_place_photo.bytes is
  'Size in bytes of the stored copy at storage_path, recorded at store time. Never re-measured after the fact; a resize or re-encode would need a new store, which lands at a new content-addressed storage_path (see that column''s comment) rather than mutating this one.';
comment on column public.wf_place_photo.content_type is
  'The MIME type the stored bytes were served with at download time (e.g. "image/jpeg"), verified by lib/photoVault.js to start with "image/" before anything is written -- a non-image response is refused, never stored under a guessed type.';

-- ── (b) the bucket + its RLS policies ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

-- storage.objects ships with row level security already enabled by Supabase
-- itself; this migration only adds POLICIES scoped to bucket_id =
-- 'place-photos', in this repo's own idempotent policy style (drop policy if
-- exists + create policy — see
-- 20260806_wf_gate_status_core_metros_grant.sql). Public read because a
-- photo Wayfind owns outright is meant to be served directly from this
-- bucket's public CDN path; every write (insert/update/delete) is
-- service_role only — no anon/authenticated write path exists, matching
-- every other write surface this photo lane touches
-- (wf_place_photo/wf_photo_repair_queue are both service_role-only too).
drop policy if exists "place-photos public read" on storage.objects;
create policy "place-photos public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'place-photos');

drop policy if exists "place-photos service role insert" on storage.objects;
create policy "place-photos service role insert"
  on storage.objects
  for insert
  to service_role
  with check (bucket_id = 'place-photos');

drop policy if exists "place-photos service role update" on storage.objects;
create policy "place-photos service role update"
  on storage.objects
  for update
  to service_role
  using (bucket_id = 'place-photos')
  with check (bucket_id = 'place-photos');

drop policy if exists "place-photos service role delete" on storage.objects;
create policy "place-photos service role delete"
  on storage.objects
  for delete
  to service_role
  using (bucket_id = 'place-photos');

-- ── (c) the worklist ─────────────────────────────────────────────────────
-- security_invoker so this view can never be used to read around RLS on the
-- tables underneath it (same reasoning as 20260905_editorial_read_gate.sql's
-- wf_editorial_servable / 20260813_wf_promotion_cron_and_lockdown.sql's
-- wf_promotion_health) -- moot for service_role (BYPASSRLS), but correct
-- regardless of which role ends up reading it.
create or replace view public.wf_photo_at_risk
with (security_invoker = true) as
select
  i.place_id,
  i.name,
  i.category,
  min(c.exp) as earliest_expiry
from public.wf_places_cache c
join public.wf_inventory i
  on i.place_id = split_part(split_part(c.k, '|', 2), '/', 2)
left join public.wf_place_photo p
  on p.place_id = i.place_id and p.status = 'active'
where c.k like 'photo|places/%'
  and c.exp > now()
  and p.place_id is null
group by i.place_id, i.name, i.category
order by earliest_expiry asc;

revoke all on public.wf_photo_at_risk from anon, authenticated;
grant select on public.wf_photo_at_risk to service_role;

comment on view public.wf_photo_at_risk is
  'The permanent-photo-vault worklist (2026-09-09): one row per place that currently has a live (unexpired) Google photo cached in wf_places_cache and NO active wf_place_photo row yet, ordered by earliest_expiry ascending so a backfill pass works the closest cliff first. The place id is recovered from the cache key itself (photo|places/<placeId>/photos/<photoId>|<width>) via split_part(split_part(k,''|'',2),''/'',2) -- no new column or index on wf_places_cache. A place with a rejected (never active) wf_place_photo row still appears here on purpose: rejected means no free-licensed substitute exists yet, not that the place stopped being at risk. service_role only.';

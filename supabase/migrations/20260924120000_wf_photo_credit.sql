-- wf_photo_credit: the photographer credit Google already sends with every
-- place photo, kept so Wayfind can show it next to that photo.
--
-- WHY (owner decision, 2026-09-23). Google's Places policy: "You must always
-- credit the author when displaying photos", with name + profile link, and a
-- link to the photo on Google Maps. Every Places (New) photo object arrives
-- with `authorAttributions` and `googleMapsUri`, but Wayfind threw them away:
-- lib/placeDetails.js normalizeDetails() kept only the photo name, and the
-- photo cache (wf_places_cache `photo|...`) keeps only the image URL. Google's
-- photo names are not stable across responses (0 of the blog's inventory refs
-- matched any name in 2,423 live search-cache rows), so the credit cannot be
-- recovered later without a new paid Place Details call. This table is filled
-- ONLY from Google responses Wayfind already paid for and already received
-- (search + details); it causes no new Google request of any kind.
--
-- SHAPE. One row per photo resource name. expires_at is the lifetime of the
-- response it came from (never more than 30 days, Google's cache limit);
-- expired rows are invisible to readers through RLS.
--
-- READERS. blog.gowayfind.com (publishable key) shows a photo with its
-- credit when a live row exists for a photo the app already holds for free.
-- Read-only for anon/authenticated; only service_role writes.
--
-- IMPACT: new table only. No existing table, column, function or row changes.
-- ROLLBACK: `drop table if exists public.wf_photo_credit;` (nothing depends on
-- it; lib/photoCredits.js writes are fail-soft, readers fall back to today's
-- behaviour).
-- ORDER: apply this migration BEFORE merging the PR that writes it (writes to
-- a missing table are fail-soft no-ops, so the reverse order is harmless but
-- wastes the credits those requests carried).

create table if not exists public.wf_photo_credit (
  photo_name text primary key
    check (photo_name ~ '^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$'),
  place_id text not null check (place_id ~ '^[A-Za-z0-9_-]+$'),
  author_name text not null check (length(author_name) between 1 and 200),
  author_uri text check (author_uri is null or (author_uri ~ '^https://' and length(author_uri) <= 500)),
  author_photo_uri text check (author_photo_uri is null or (author_photo_uri ~ '^https://' and length(author_photo_uri) <= 500)),
  maps_uri text check (maps_uri is null or (maps_uri ~ '^https://' and length(maps_uri) <= 1000)),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  expires_at timestamptz not null,
  captured_at timestamptz not null default now(),
  constraint wf_photo_credit_place_matches_name check (split_part(photo_name, '/', 2) = place_id),
  constraint wf_photo_credit_max_30_days check (expires_at <= captured_at + interval '31 days')
);

create index if not exists wf_photo_credit_place_live_idx
  on public.wf_photo_credit (place_id, expires_at desc);

alter table public.wf_photo_credit enable row level security;

revoke all on public.wf_photo_credit from public, anon, authenticated;
grant select on public.wf_photo_credit to anon, authenticated;
grant select, insert, update, delete on public.wf_photo_credit to service_role;

drop policy if exists wf_photo_credit_read_live on public.wf_photo_credit;
create policy wf_photo_credit_read_live on public.wf_photo_credit
  for select to anon, authenticated
  using (expires_at > now());

comment on table public.wf_photo_credit is
  'Google Places photo author credits Wayfind already received (search/details responses), keyed by photo resource name. Written only by lib/photoCredits.js (service_role); never triggers a Google request. Rows past expires_at (<= 30 days, Google cache limit) are hidden by RLS. Read by blog.gowayfind.com to credit each photo. Added 2026-09-23.';

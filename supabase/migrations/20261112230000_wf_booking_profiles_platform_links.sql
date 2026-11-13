-- Reserve a table, v2: a private Booking Profile per signed-in user, and the verified link between
-- a Wayfind place and its OpenTable restaurant.
--
-- Owner spec 2026-11-12: saved name/phone are reused so a second booking feels instant; the user can
-- view, edit and delete them. Booking path per restaurant is decided by server code: Wayfind partner,
-- then OpenTable (verified rid only), then none.
--
-- Schema/data impact: additive. Two new tables. No existing table, function, policy or row is touched.
-- Permissions/RLS:
--   wf_booking_profiles: RLS on. A signed-in user may SELECT, INSERT, UPDATE and DELETE only their
--     own row (user_id = auth.uid()). anon has no access. Kept apart from public.profiles on purpose:
--     phone numbers never sit next to a public username/avatar, and deleting this row deletes them.
--   wf_reserve_platform_links: RLS on, no client policy at all. Read and written only by the server
--     (service role). Holds which OpenTable restaurant (rid) a place is, with the evidence for it.
-- Privacy: mobile_phone needs consent (check: phone null or consent_at not null). Rows cascade-delete
--   with the auth user. No name or phone is ever written anywhere else by this feature.
-- Rollback: drop table public.wf_reserve_platform_links; drop table public.wf_booking_profiles;
-- Deployment order: migration first, code second. Without the tables the profile and handoff routes
--   answer 503 rather than pretending.
begin;

create table public.wf_booking_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text check (first_name is null or (char_length(btrim(first_name)) between 1 and 60)),
  last_name text check (last_name is null or (char_length(btrim(last_name)) between 1 and 60)),
  mobile_phone text check (mobile_phone is null or mobile_phone ~ '^\+[1-9][0-9]{7,14}$'),
  preferred_email text check (preferred_email is null or (char_length(preferred_email) <= 254 and preferred_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  default_party_size int check (default_party_size is null or default_party_size between 1 and 20),
  consent_at timestamptz,
  consent_version text check (consent_version is null or char_length(consent_version) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_booking_profiles_phone_needs_consent check (mobile_phone is null or consent_at is not null)
);

alter table public.wf_booking_profiles enable row level security;
revoke all on public.wf_booking_profiles from anon;
revoke all on public.wf_booking_profiles from authenticated;
grant select, insert, update, delete on public.wf_booking_profiles to authenticated;

create policy wf_booking_profiles_select on public.wf_booking_profiles
  for select to authenticated using (user_id = auth.uid());
create policy wf_booking_profiles_insert on public.wf_booking_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy wf_booking_profiles_update on public.wf_booking_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wf_booking_profiles_delete on public.wf_booking_profiles
  for delete to authenticated using (user_id = auth.uid());

create table public.wf_reserve_platform_links (
  place_id text not null,
  platform text not null check (platform in ('opentable')),
  external_id text not null check (external_id ~ '^[0-9]{1,9}$'),
  external_slug text check (external_slug is null or external_slug ~ '^[a-z0-9-]{1,120}$'),
  evidence_url text not null check (evidence_url ~ '^https://'),
  verified_by text not null check (char_length(verified_by) between 1 and 80),
  verified_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (place_id, platform)
);

create unique index wf_reserve_platform_links_external on public.wf_reserve_platform_links (platform, external_id);

alter table public.wf_reserve_platform_links enable row level security;
revoke all on public.wf_reserve_platform_links from anon;
revoke all on public.wf_reserve_platform_links from authenticated;

commit;

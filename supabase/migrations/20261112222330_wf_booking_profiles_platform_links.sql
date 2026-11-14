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
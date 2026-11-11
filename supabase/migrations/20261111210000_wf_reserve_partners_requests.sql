-- Reserve a table: partner restaurants and the table requests sent to them.
--
-- NOT APPLIED. Requires explicit owner approval.
--
-- Schema/data impact: additive. Two new tables (wf_reserve_partners,
--   wf_reserve_requests). No existing table, function, policy or row is touched.
-- Permissions/RLS: RLS is enabled on both. All access is revoked from anon and
--   authenticated. The only policy lets an authenticated user SELECT their own
--   wf_reserve_requests rows (user_id = auth.uid()). wf_reserve_partners has no
--   client policy: contact emails are private and reach the app only through the
--   service role. Writes happen only through the service role (the app server).
-- Rollback: drop table public.wf_reserve_requests; drop table public.wf_reserve_partners;
--   (requests first, it references partners).
-- Deployment order: migration first, code second. The code reads these tables only
--   behind WF_RESERVE_EMAIL_ENABLED in production; without the tables the partner
--   list route answers 503 RESERVE_STORAGE_UNAVAILABLE rather than an empty list.
begin;

create table public.wf_reserve_partners (
  place_id text primary key,
  name text not null,
  contact_email text not null,
  stage text not null default 'demo' check (stage in ('demo','live')),
  active boolean not null default true,
  max_party int not null default 12 check (max_party between 1 and 40),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wf_reserve_requests (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.wf_reserve_partners(place_id),
  user_id uuid not null,
  guest_name text not null,
  party_size int not null check (party_size between 1 and 40),
  reserve_date date not null,
  reserve_time time not null,
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','expired')),
  respond_token_hash text not null unique,
  responded_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index wf_reserve_requests_user_created on public.wf_reserve_requests(user_id, created_at desc);
create index wf_reserve_requests_place_date on public.wf_reserve_requests(place_id, reserve_date);

alter table public.wf_reserve_partners enable row level security;
alter table public.wf_reserve_requests enable row level security;
revoke all on public.wf_reserve_partners, public.wf_reserve_requests from public, anon, authenticated;
grant select, insert, update, delete on public.wf_reserve_partners, public.wf_reserve_requests to service_role;

-- A signed in user may read only their own requests. Nothing else is granted to clients.
grant select on public.wf_reserve_requests to authenticated;
create policy wf_reserve_requests_own_select on public.wf_reserve_requests
  for select to authenticated using (user_id = auth.uid());

commit;

-- Competitor watch (scripts/ci-monitor.mjs, daily in .github/workflows/ci-monitor.yml).
--
-- Two private tables:
--   wf_competitor_intel   one row per signal seen on a competitor's PUBLIC feed,
--                         sitemap, listing, promo or calendar page: a new seasonal
--                         guide, a new event, a sale banner, a ticket discount, an
--                         affiliate offer shift or a calendar change.
--   wf_competitor_promos  one row per competitor discount of 10% or more, with a
--                         review status for the owner.
--
-- WHAT IS NEVER STORED: page bodies. Only sha256 hashes of URLs and promo blocks,
-- short titles (160 chars) and a short structured summary in our own words
-- (400 chars). The checks below hold that line in the database too.
--
-- SECURITY. Row level security is ON with NO policies, and every grant to anon
-- and authenticated is revoked, exactly like wf_ai_board. Only the service role
-- (the scheduled workflow) can read or write. The public anon key gets nothing.
--
-- Dedupe is the database's job: unique (competitor, source_url_hash, signal_type)
-- and unique (competitor, source_url_hash, subject), so a daily rerun never
-- doubles a row. Locked by scripts/test-competitor-watch-schema.mjs (PGlite).
--
-- Additive only. Reverse:
--   begin;
--   drop table if exists public.wf_competitor_promos, public.wf_competitor_intel;
--   commit;

begin;

create table if not exists public.wf_competitor_intel (
  id              bigint generated always as identity primary key,
  competitor      text not null check (competitor ~ '^[a-z0-9-]{2,40}$'),
  tier            smallint not null check (tier between 1 and 3),
  source_url_hash text not null check (source_url_hash ~ '^[a-f0-9]{64}$'),
  source_host     text not null check (char_length(source_host) between 1 and 253 and source_host ~ '^[a-z0-9.-]+$'),
  title           text not null default '' check (char_length(title) <= 160),
  metro           text not null check (metro ~ '^[a-z-]{2,30}$'),
  signal_type     text not null check (signal_type in ('new_guide', 'new_event', 'sale_banner', 'discount', 'affiliate_shift', 'calendar_change')),
  diff_summary    text not null default '' check (char_length(diff_summary) <= 400),
  matched_wayfind boolean not null default false,
  match_ref       text check (match_ref is null or char_length(match_ref) <= 120),
  detected_at     timestamptz not null default now(),
  constraint wf_competitor_intel_dedupe unique (competitor, source_url_hash, signal_type)
);

create index if not exists wf_competitor_intel_detected_idx
  on public.wf_competitor_intel (detected_at desc);

create table if not exists public.wf_competitor_promos (
  id              bigint generated always as identity primary key,
  competitor      text not null check (competitor ~ '^[a-z0-9-]{2,40}$'),
  metro           text not null check (metro ~ '^[a-z-]{2,30}$'),
  subject         text not null check (char_length(subject) between 1 and 160),
  observed_price  numeric(10, 2) check (observed_price is null or observed_price >= 0),
  discount_pct    numeric(5, 2) check (discount_pct is null or (discount_pct >= 0 and discount_pct <= 100)),
  impact_level    text not null check (impact_level in ('low', 'medium', 'high')),
  status          text not null default 'new' check (status in ('new', 'reviewed', 'dismissed')),
  source_url      text not null check (char_length(source_url) <= 2048 and source_url ~ '^https://'),
  source_url_hash text not null check (source_url_hash ~ '^[a-f0-9]{64}$'),
  detected_at     timestamptz not null default now(),
  constraint wf_competitor_promos_dedupe unique (competitor, source_url_hash, subject)
);

create index if not exists wf_competitor_promos_detected_idx
  on public.wf_competitor_promos (detected_at desc);

alter table public.wf_competitor_intel  enable row level security;
alter table public.wf_competitor_promos enable row level security;

revoke all on table public.wf_competitor_intel  from anon, authenticated;
revoke all on table public.wf_competitor_promos from anon, authenticated;

do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('wf_competitor_intel', 'wf_competitor_promos')
         and c.relrowsecurity) <> 2 then
    raise exception 'wf_competitor_watch: row level security is not on for both tables; rolled back';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('wf_competitor_intel', 'wf_competitor_promos')) then
    raise exception 'wf_competitor_watch: a policy exists on a competitor table; they must stay service-role only';
  end if;
end $$;

commit;

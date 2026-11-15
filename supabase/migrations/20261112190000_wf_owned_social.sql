-- wf_owned_social: every Reel, carousel and photo Wayfind publishes on its own
-- Instagram (@gowayfind.app), one row per post (owner, 2026-11-12: "every
-- eligible Reel or carousel ... must appear under Trending, with zero silent
-- misses").
--
-- SCHEMA / DATA IMPACT: one new table and one new public storage bucket. No
-- existing table, policy or function changes. Rows are written only by the
-- service role (the ingestion task and /api/cron/owned-social).
--
-- PERMISSIONS / RLS: RLS ON. The only policy lets anon/authenticated read rows
-- that are published AND eligible (what the Trending shelf shows). Excluded,
-- scheduled and draft rows are never readable by the public, so a draft can
-- not leak. No insert/update/delete policy: only the service role writes.
--
-- ROLLBACK: drop table public.wf_owned_social; delete the 'owned-social'
-- bucket after emptying it. Nothing else depends on either.
--
-- ORDERING: migration first, then the code that reads it (lib/ownedSocial.js,
-- /api/owned-social, /api/cron/owned-social). Until the table exists the shelf
-- simply renders nothing and the cron reports the read failure.

create table if not exists public.wf_owned_social (
  -- The Instagram shortcode (/reel/<code>/ or /p/<code>/). The one key every
  -- source agrees on: Metricool ids and Graph media ids are different numbers
  -- for the same post, the shortcode is not.
  shortcode          text primary key check (shortcode ~ '^[A-Za-z0-9_-]{5,40}$'),
  permalink          text not null check (permalink ~ '^https://www\.instagram\.com/(reel|p)/[A-Za-z0-9_-]{5,40}/$'),
  format             text not null check (format in ('reel', 'carousel', 'image')),
  -- CREATED -> SCHEDULED -> PUBLISHED. Only 'published' is ever shown.
  lifecycle          text not null default 'published' check (lifecycle in ('created', 'scheduled', 'published', 'deleted')),
  published_at       timestamptz,
  caption            text,
  title              text check (title is null or char_length(title) <= 90),
  city               text,
  region             text,
  places             text[] not null default '{}',
  place_ids          text[] not null default '{}',
  event_ids          text[] not null default '{}',
  -- Last day the post's content is useful (an event guide's end date). Null =
  -- evergreen; lib/ownedSocial.js then applies the freshness window.
  relevant_until     date,
  -- Evergreen place content (a cafe, a park, a shop) stays live past the
  -- freshness window while it is still useful. Dated guides never use this:
  -- relevant_until always wins, so an expired event guide disappears on time.
  evergreen          boolean not null default false,
  -- Where the eligibility call came from. 'audit' and 'owner' decisions are
  -- never changed by automation: the sync only inserts new posts and refreshes
  -- source fields, so an excluded ad, meme, duplicate or out-of-state post can
  -- not be silently re-added.
  decision_source    text not null default 'auto' check (decision_source in ('auto', 'audit', 'owner')),
  -- Matching Wayfind pages for the post: [{"label": "...", "href": "/florida-events/<slug>" | "/p/<place id>"}].
  wayfind_links      jsonb not null default '[]'::jsonb check (jsonb_typeof(wayfind_links) = 'array'),
  eligibility        text not null default 'eligible' check (eligibility in ('eligible', 'excluded')),
  -- No silent omissions: an excluded row must say why, an eligible row must not.
  exclusion_reason   text check (exclusion_reason is null or exclusion_reason in (
                       'format_single_image', 'brand_promo_no_discovery', 'ad_creative',
                       'companion_duplicate', 'not_florida', 'owner_excluded', 'rights_restricted', 'deleted_on_instagram')),
  companion_of       text,
  caption_issue      text,
  classification_note text,
  cover_source_url   text,
  cover_url          text,
  cover_stored_at    timestamptz,
  source             text not null check (source in ('metricool', 'graph', 'manual')),
  source_media_id    text,
  first_ingested_at  timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  trending_verified_at timestamptz,
  updated_at         timestamptz not null default now(),
  constraint wf_owned_social_reason_matches check ((eligibility = 'excluded') = (exclusion_reason is not null)),
  constraint wf_owned_social_companion_reason check (companion_of is null or exclusion_reason = 'companion_duplicate')
);

create index if not exists wf_owned_social_published_idx on public.wf_owned_social (published_at desc);

alter table public.wf_owned_social enable row level security;

drop policy if exists wf_owned_social_public_read on public.wf_owned_social;
create policy wf_owned_social_public_read on public.wf_owned_social
  for select to anon, authenticated
  using (lifecycle = 'published' and eligibility = 'eligible');

-- Covers are copied here because Instagram CDN image links expire within days.
-- These are Wayfind's own posts, so hosting the cover is within our rights.
insert into storage.buckets (id, name, public)
values ('owned-social', 'owned-social', true)
on conflict (id) do nothing;
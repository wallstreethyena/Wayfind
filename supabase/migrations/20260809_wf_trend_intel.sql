-- 20260809_wf_trend_intel.sql — Exploding Topics trend-intelligence tables.
--
-- ⚠ NOT APPLIED. No snapshot has been imported, and applying schema to the
-- production database is an owner-gated action (AGENTS.md §11). This file is
-- the reviewed artifact; the owner applies it.
--
-- POSTURE. Identical to supabase/places-inventory.sql: RLS ON, and NO write
-- policy is declared for anon/authenticated. The service role bypasses RLS, so
-- "no policy" is what makes every write server-only. Read access is granted only
-- where a public surface genuinely needs it. Raw source rows are not among
-- those; the serving route returns only the narrow, verified card payload.
--
-- ROLLBACK is at the foot of this file.

-- ── 1. Snapshots — one row per imported CSV ────────────────────────────────
create table if not exists public.wf_trend_snapshots (
  id                uuid primary key default gen_random_uuid(),
  source_mode       text not null,                    -- 'csv_manual' — the only mode; there is no API
  source_hash       text not null,                    -- sha256 of the file: the idempotency key
  imported_at       timestamptz not null default now(),
  observed_at       timestamptz not null,             -- the DATA's date, not the import's
  exported_at       timestamptz,                      -- when the human pulled it, when the file says
  expected_cadence  text not null,                    -- 'weekly' | 'daily' (EXPLODING_TOPICS_IMPORT_CADENCE)
  status            text not null,                    -- validating|complete|partial|failed|stale
  schema_version    text not null,
  requested_rows    integer not null default 0,
  accepted_rows     integer not null default 0,
  rejected_rows     integer not null default 0,
  duplicate_rows    integer not null default 0,
  rejection_summary jsonb,                            -- { reason: count } — never raw rows
  notes             text,
  constraint wf_trend_snapshots_status_ck
    check (status in ('validating','complete','partial','failed','stale')),
  constraint wf_trend_snapshots_cadence_ck
    check (expected_cadence in ('weekly','daily'))
);
-- Re-importing the same file is a no-op, not a second snapshot. This unique
-- index is what makes `--apply` idempotent at the database rather than relying
-- on the importer to remember.
create unique index if not exists wf_trend_snapshots_hash on public.wf_trend_snapshots (source_hash);
create index if not exists wf_trend_snapshots_observed on public.wf_trend_snapshots (observed_at desc);

-- ── 2. Normalized topics ───────────────────────────────────────────────────
create table if not exists public.wf_trend_topics (
  id                uuid primary key default gen_random_uuid(),
  snapshot_id       uuid not null references public.wf_trend_snapshots(id) on delete cascade,
  topic_key         text not null,                    -- stable external key from the export
  canonical_topic   text not null,                    -- as printed in the source
  normalized_topic  text not null,                    -- lowercased/stripped, the alias-match input
  source_category   text,
  topic_family      text,                             -- lib/trendTaxonomy.js TOPIC_FAMILIES
  concept_key       text,                             -- the Wayfind concept, null when unmapped
  classification    text,                             -- exploding|rising|regular|peaked|...
  search_volume     numeric,
  growth_3mo        numeric,                          -- ratios, not percents (1.9 = +190%)
  growth_6mo        numeric,
  growth_12mo       numeric,
  growth_longterm   numeric,
  -- FORECAST IS STRUCTURALLY SEPARATE and is not read by any ranking path.
  -- Kept for the internal report so its accuracy can be measured against later
  -- snapshots before anyone argues for promoting it.
  forecast_growth   numeric,
  volatility        numeric,
  stability         numeric,
  seasonal          boolean,
  observed_at       timestamptz not null,
  volume_percentile numeric,                          -- category-RELATIVE, 0..1
  strength          numeric,                          -- normalized 0..1, forecast excluded
  eligible          boolean not null default false,
  eligibility_reason text not null,                   -- ALWAYS set, both directions
  -- Raw row stays service-role only and never enters the public serving payload.
  raw_row           jsonb,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);
create unique index if not exists wf_trend_topics_snap_key on public.wf_trend_topics (snapshot_id, topic_key);
create index if not exists wf_trend_topics_eligible on public.wf_trend_topics (eligible, expires_at) where eligible;
create index if not exists wf_trend_topics_concept on public.wf_trend_topics (concept_key) where concept_key is not null;

-- ── 3. Topic → concept mappings (the audit trail for taxonomy decisions) ───
create table if not exists public.wf_trend_concept_map (
  id                uuid primary key default gen_random_uuid(),
  topic_key         text not null,
  concept_key       text not null,
  aliases           text[] not null default '{}',
  allowed_place_types   text[] not null default '{}',
  allowed_primary_types text[] not null default '{}',
  allowed_categories    text[] not null default '{}',
  allowed_lists         text[] not null default '{}',
  disallowed_types      text[] not null default '{}',
  experience_intent text,                             -- eat|drink|visit|attend|book|do
  semantic_confidence numeric,
  review_state      text not null default 'auto',     -- auto|approved|denied|needs_review
  decision_reason   text,
  version           integer not null default 1,
  updated_at        timestamptz not null default now(),
  constraint wf_trend_concept_map_review_ck
    check (review_state in ('auto','approved','denied','needs_review'))
);
create unique index if not exists wf_trend_concept_map_key on public.wf_trend_concept_map (topic_key, concept_key, version);

-- ── 4. Place ↔ topic matches ───────────────────────────────────────────────
create table if not exists public.wf_trend_place_matches (
  id                uuid primary key default gen_random_uuid(),
  place_id          text not null,                    -- Google Place ID
  topic_key         text not null,
  concept_key       text not null,
  snapshot_id       uuid not null references public.wf_trend_snapshots(id) on delete cascade,
  wf_list           text not null,                    -- one of the eight menu lists
  match_evidence    jsonb not null,                   -- [{kind, detail, weight}] — the audit trail
  semantic_confidence numeric not null,
  trend_strength    numeric not null,
  freshness_factor  numeric not null,
  order_boost       numeric not null,                 -- the ONE bounded ordering term
  baseline_rank     integer,
  adjusted_rank     integer,
  internal_explanation text not null,                 -- always populated
  -- Only ever written when rights permit display. Null is the normal state.
  public_explanation text,
  manual_state      text not null default 'auto',     -- auto|allow|deny
  matched_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  constraint wf_trend_place_matches_manual_ck check (manual_state in ('auto','allow','deny')),
  -- The ordering term is bounded IN THE DATABASE too. A code bug that computed a
  -- 40-point boost would be rejected at write time rather than silently
  -- reordering a metro. Must track lib/trendOrder.js MAX_BOOST.
  constraint wf_trend_place_matches_boost_ck check (order_boost >= 0 and order_boost <= 4.0),
  constraint wf_trend_place_matches_conf_ck  check (semantic_confidence >= 0 and semantic_confidence <= 1),
  constraint wf_trend_place_matches_strength_ck check (trend_strength >= 0 and trend_strength <= 1)
);
create unique index if not exists wf_trend_place_matches_uniq on public.wf_trend_place_matches (place_id, topic_key, snapshot_id, wf_list);
create index if not exists wf_trend_place_matches_live on public.wf_trend_place_matches (wf_list, expires_at) where manual_state <> 'deny';

-- ── 5. Discovery queue ─────────────────────────────────────────────────────
create table if not exists public.wf_trend_discovery_queue (
  id                uuid primary key default gen_random_uuid(),
  topic_key         text not null,
  concept_key       text not null,
  target_metro      text not null,
  target_list       text,
  query_template    text not null,                    -- the CONTROLLED template, never raw CSV text
  query_type        text not null default 'searchText',
  priority          integer not null default 100,
  status            text not null default 'proposed',
  estimated_calls   integer not null default 0,
  actual_calls      integer not null default 0,
  candidates_found  integer not null default 0,
  accepted_count    integer not null default 0,
  rejected_count    integer not null default 0,
  rejection_reasons jsonb,
  -- A run that hit a cap or a 429 is PARTIAL and must never render as complete
  -- (AGENTS.md §4e). Persisted, not derived, so the verdict survives the run.
  completion        text,                             -- complete|partial|null
  partial_reason    text,                             -- budget|saturation|429|deadline
  created_at        timestamptz not null default now(),
  processed_at      timestamptz,
  constraint wf_trend_discovery_status_ck
    check (status in ('proposed','approved','searching','candidates_found','exhausted','blocked','failed')),
  constraint wf_trend_discovery_completion_ck
    check (completion is null or completion in ('complete','partial'))
);
create index if not exists wf_trend_discovery_ready on public.wf_trend_discovery_queue (status, priority desc) where status = 'approved';

-- ── 6. Candidate inventory (private; NOT wf_inventory) ─────────────────────
create table if not exists public.wf_trend_candidates (
  place_id          text primary key,                 -- Google Place ID (storable indefinitely)
  discovered_via_topic text not null,
  discovered_via_concept text not null,
  discovered_metro  text not null,
  queue_id          uuid references public.wf_trend_discovery_queue(id) on delete set null,
  state             text not null default 'discovered',
  failure_reason    text,
  -- Google content, subject to the 30-day cache limit. Deliberately in a
  -- SEPARATE column group from the Wayfind-derived classification below, so the
  -- expiry sweep can null these without destroying our own work.
  name              text,
  lat               double precision,
  lng               double precision,
  google_types      text[],
  primary_type      text,
  status            text,
  rating            numeric,
  reviews           integer,
  price_level       integer,
  photo_ref         text,
  google_refreshed_at timestamptz,
  -- Wayfind-derived. Persists past the Google content expiry.
  wf_category       text,
  wf_tags           text[],
  needs_review      boolean not null default true,    -- default TRUE: unproven until classified
  promoted_to_inventory boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists wf_trend_candidates_state on public.wf_trend_candidates (state);
-- Drives the 30-day Google-content expiry sweep.
create index if not exists wf_trend_candidates_google_age on public.wf_trend_candidates (google_refreshed_at);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.wf_trend_snapshots        enable row level security;
alter table public.wf_trend_topics           enable row level security;
alter table public.wf_trend_concept_map      enable row level security;
alter table public.wf_trend_place_matches    enable row level security;
alter table public.wf_trend_discovery_queue  enable row level security;
alter table public.wf_trend_candidates       enable row level security;

-- NO POLICIES ARE DECLARED. With RLS on and no policy, anon and authenticated
-- read ZERO rows and write ZERO rows; only the service role (which bypasses RLS)
-- can touch these tables.
--
-- This is deliberate: source topics and matching evidence stay server-only.
-- The same-origin serving route returns only the verified card payload and
-- remains rate-limited; a broad table grant would route around that boundary.

comment on table public.wf_trend_snapshots is
  'Exploding Topics CSV snapshots. Service-role only; cadence and source hash make freshness and re-imports auditable.';
comment on table public.wf_trend_topics is
  'Normalized topics. Source rows stay server-only; forecast_growth is excluded from all ranking paths by design.';
comment on table public.wf_trend_place_matches is
  'Topic-to-place matches. order_boost is ORDER-ONLY and DB-bounded to 4.0; it never feeds the displayed Wayfind Score.';
comment on table public.wf_trend_candidates is
  'Private candidate library. Google content columns expire at 30 days; Wayfind-derived classification persists.';

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Drop in reverse dependency order. No other table references these, and
-- wf_inventory is untouched by this migration, so the rollback is total:
--
--   drop table if exists public.wf_trend_candidates;
--   drop table if exists public.wf_trend_discovery_queue;
--   drop table if exists public.wf_trend_place_matches;
--   drop table if exists public.wf_trend_concept_map;
--   drop table if exists public.wf_trend_topics;
--   drop table if exists public.wf_trend_snapshots;


-- wf_revenue_coverage — the canonical revenue ledger. One durable row per
-- monetization RELATIONSHIP (entity x provider x offer), not per card.
--
-- THE LAW (mirrors lib/verifiedOffers.js isLiveEligible): fuzzy/title matching
-- may NOMINATE a candidate; it can never CERTIFY one. The check constraint
-- below makes that structural, so a future backfill cannot promote a
-- title-containment guess into revenue coverage by accident.
create table if not exists public.wf_revenue_coverage (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null check (entity_type in ('place','event')),
  entity_id      text not null,
  entity_name    text,
  category       text,
  provider       text,   -- wf_affiliate_providers.provider
  offer_kind     text check (offer_kind in ('deal','viator_product','manual_product','none')),
  offer_id       text,   -- wf_deals.id, viator product_code, manual product_code
  offer_url      text,
  product_type   text,   -- 'event-ticket' | 'park-admission' | 'experience' | 'admission'
  mapping_method text not null check (mapping_method in (
                   'code_registry',      -- lib/eventTicketDeals.js EVENT_TICKET_DEALS
                   'manual_verified',    -- wf_place_products_manual, a human signed it
                   'resolver_verified',  -- verified_offers status='live'
                   'title_candidate',    -- viator title containment — NOMINATION ONLY
                   'name_candidate',     -- wf_deals.maps_to name match — NOMINATION ONLY
                   'none')),
  status         text not null default 'candidate' check (status in (
                   'certified','candidate','no_program','not_monetizable','rejected')),
  confidence     numeric,
  evidence       jsonb not null default '{}'::jsonb,
  reason         text,   -- why this was accepted or refused, in words
  link_ok        boolean,
  link_checked_at timestamptz,
  verified_at    timestamptz,
  expires_at     timestamptz,
  first_seen_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- FAIL CLOSED. Certified requires a real offer, a live link, a trustworthy
  -- provenance, and (when scored) resolver-grade confidence. now() cannot be
  -- used in a check constraint, so expiry is enforced by the KPI view.
  constraint wf_revenue_coverage_certify_law check (
    status <> 'certified' or (
      mapping_method in ('code_registry','manual_verified','resolver_verified')
      and offer_id is not null
      and offer_url is not null
      and link_ok is true
      and coalesce(confidence, 1) >= 0.72
    )
  )
);

-- One row per relationship. coalesce() keeps NULL provider/offer from
-- duplicating silently.
create unique index if not exists wf_revenue_coverage_rel_uidx
  on public.wf_revenue_coverage (entity_type, entity_id, coalesce(provider,''), coalesce(offer_id,''));
create index if not exists wf_revenue_coverage_status_idx on public.wf_revenue_coverage (entity_type, status);
create index if not exists wf_revenue_coverage_provider_idx on public.wf_revenue_coverage (provider);

-- Internal ledger. Service-role only, matching wf_scout_verdicts / wf_feedback:
-- RLS on with NO policies means anon and authenticated read zero rows.
alter table public.wf_revenue_coverage enable row level security;

-- Candidate generation without the 68-million-comparison scan.
create index if not exists wf_experiences_title_trgm
  on public.wf_experiences using gin (title gin_trgm_ops);
create index if not exists wf_inventory_name_trgm
  on public.wf_inventory using gin (name gin_trgm_ops);

comment on table public.wf_revenue_coverage is
  'Canonical revenue ledger (2026-09-09). One row per entity x provider x offer relationship. Fuzzy matching nominates (status=candidate); only code_registry / manual_verified / resolver_verified may be certified, enforced by wf_revenue_coverage_certify_law. Replaces wf_affiliate_coverage, which counted inventory by category and named a possible route rather than a proven one.';

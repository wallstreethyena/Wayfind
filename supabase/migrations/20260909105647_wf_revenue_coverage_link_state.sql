
-- Defect in the 2026-09-09 ledger: the certify law required wf_deals.link_ok = true
-- and copied that flag in at backfill time. Two things were wrong with that.
--   1) link_ok was a poisoned input. The pre-#1200 checker read a 403 bot challenge
--      as healthy, so all 18 Undercover Tourist rows carry link_ok=true / http_status=403.
--   2) Copying a flag freezes it. When deals-health next writes link_ok=NULL for those
--      rows (lib/dealHealth.js healthPatch), the ledger would still assert true.
--
-- Fix: store the EVIDENCE (http status) and a three-state verdict that mirrors
-- lib/dealHealth.js destinationHealth exactly. A blocked response is not evidence in
-- either direction, so it can neither certify nor kill a mapping — it is surfaced.
alter table public.wf_revenue_coverage
  add column if not exists link_state text
    check (link_state in ('ok','unknown','dead')),
  add column if not exists link_http_status integer;

-- Backfill from the live deal rows, deriving the verdict rather than trusting the flag.
update public.wf_revenue_coverage c
set link_http_status = d.http_status,
    link_state = case
      when d.http_status between 200 and 299 then 'ok'
      when d.http_status in (404, 410) then 'dead'
      else 'unknown'
    end,
    evidence = c.evidence || jsonb_build_object(
      'link_evidence', jsonb_build_object(
        'http_status', d.http_status,
        'checked_at', d.last_checked_at,
        'note', 'Merchant-only probe. 403/429 is a bot challenge and proves nothing either way.')),
    updated_at = now()
from public.wf_deals d
where c.offer_kind = 'deal' and c.offer_id = d.id::text;

-- Manual rows: a human signed them, no automated probe covers them.
update public.wf_revenue_coverage
set link_state = 'unknown',
    evidence = evidence || jsonb_build_object('link_evidence', jsonb_build_object('note','No automated check covers manual rows; human verification only.')),
    updated_at = now()
where mapping_method = 'manual_verified' and link_state is null;

-- Viator candidates carry their own stored classification.
update public.wf_revenue_coverage
set link_state = case when link_ok is true then 'ok' else 'unknown' end, updated_at = now()
where link_state is null and provider = 'viator';

update public.wf_revenue_coverage set link_state = 'unknown', updated_at = now() where link_state is null;

-- The law, restated. Certification comes from a code pin or a human, never from a
-- bot probe — but a CONFIRMED dead destination still kills it.
alter table public.wf_revenue_coverage drop constraint if exists wf_revenue_coverage_certify_law;
alter table public.wf_revenue_coverage add constraint wf_revenue_coverage_certify_law check (
  status <> 'certified' or (
    mapping_method in ('code_registry','manual_verified','resolver_verified')
    and offer_id is not null
    and offer_url is not null
    and link_state is not null
    and link_state <> 'dead'
    and coalesce(confidence, 1) >= 0.72
  )
);

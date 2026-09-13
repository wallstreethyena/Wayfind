
-- The CEO number, computed deterministically and instantly. security_invoker
-- so the ledger's RLS still applies through the view.
create or replace view public.wf_revenue_coverage_kpi
with (security_invoker = true) as
select
  entity_type,
  count(*) filter (where status = 'certified' and (expires_at is null or expires_at > now())) as monetized,
  count(*) filter (where status = 'certified' and expires_at <= now())                        as expired,
  count(*) filter (where status = 'candidate')                                                as candidates,
  count(*) filter (where status = 'no_program')                                               as no_program,
  count(*) filter (where status = 'not_monetizable')                                          as not_monetizable,
  count(*) filter (where status = 'rejected')                                                 as rejected,
  count(distinct entity_id) filter (where status = 'certified' and (expires_at is null or expires_at > now())) as monetized_entities,
  max(updated_at) as last_updated
from public.wf_revenue_coverage
group by entity_type;

comment on view public.wf_revenue_coverage_kpi is
  'Live monetization KPI. monetized_entities is the number to put on the dashboard; it is computed from the ledger, never from the title-containment scan.';

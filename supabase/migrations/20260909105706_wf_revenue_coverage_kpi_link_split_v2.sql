
drop view if exists public.wf_revenue_coverage_kpi;
create view public.wf_revenue_coverage_kpi
with (security_invoker = true) as
select
  entity_type,
  count(distinct entity_id) filter (where status='certified' and (expires_at is null or expires_at > now()))                          as monetized_entities,
  count(distinct entity_id) filter (where status='certified' and (expires_at is null or expires_at > now()) and link_state='ok')      as link_verified,
  count(distinct entity_id) filter (where status='certified' and (expires_at is null or expires_at > now()) and link_state='unknown') as link_unverified,
  count(*) filter (where status='certified' and expires_at <= now())  as expired,
  count(*) filter (where status='candidate')                          as candidates,
  count(*) filter (where status='no_program')                         as no_program,
  count(*) filter (where status='not_monetizable')                    as not_monetizable,
  count(*) filter (where status='rejected')                           as rejected,
  max(updated_at) as last_updated
from public.wf_revenue_coverage
group by entity_type;

comment on view public.wf_revenue_coverage_kpi is
  'Live monetization KPI. monetized_entities is the dashboard number; link_verified vs link_unverified keeps a blocked (403/429) merchant probe visible instead of letting it pass as proof. Never computed from the title-containment scan.';

-- One authority for affiliate link health.
--
-- Incident, 2026-09-10: the legacy pg_cron job wf-affiliate-link-integrity
-- called wf_verify_affiliate_links() every three hours. That function could
-- treat a bot-challenge body as proof of a successful affiliate redirect and
-- write wf_deals.link_ok=true even when http_status=403. The dedicated
-- deals-health route correctly classifies 403/429 as UNKNOWN, so the two
-- writers repeatedly disagreed and the legacy writer kept re-poisoning all
-- 18 Undercover Tourist rows.
--
-- Dedicated routes are now the only link-health writers:
--   /api/cron/deals-health
--   /api/cron/events-link-health
--   /api/cron/experiences-link-health
--
-- This migration is intentionally idempotent so it also reconciles the
-- emergency production containment applied before merge.

select cron.alter_job(jobid, active := false)
from cron.job
where jobname = 'wf-affiliate-link-integrity';

update public.wf_deals
set link_ok = null
where link_ok is true
  and http_status in (403, 429);

alter table public.wf_deals
  drop constraint if exists wf_deals_blocked_response_not_healthy;
alter table public.wf_deals
  add constraint wf_deals_blocked_response_not_healthy
  check (not (link_ok is true and http_status in (403, 429)));

create or replace function public.wf_verify_affiliate_links(
  p_limit integer default 250,
  p_stale_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return jsonb_build_object(
    'skipped', true,
    'reason', 'deprecated_single_writer',
    'deals_checked', 0,
    'exp_checked', 0,
    'ran_at', now()
  );
end;
$function$;

revoke all on function public.wf_verify_affiliate_links(integer, integer)
  from public, anon, authenticated;
grant execute on function public.wf_verify_affiliate_links(integer, integer)
  to service_role;

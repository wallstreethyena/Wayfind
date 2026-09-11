
-- wf_revenue_lanes — the work queue definition, by category, with the partner whose
-- MECHANISM actually fits that category. This exists because the old
-- wf_affiliate_coverage named a partner per category without checking whether that
-- partner's matching method could ever reach those cards.
--
-- Mechanism notes (why each lane exists):
--   hotels     Stay22 resolves by lat/lng. No name matching. Every hotel already has
--              coordinates, so coverage is a wiring job, not a data job.
--   food       Clipp is keyed per merchant (place_id), which is the only shape that
--   nightlife  can reach 12k independent venues. Viator/UT structurally cannot.
--   attractions Tiqets + Klook + UT + Viator, matched through the evidence resolver
--   beach      (lib/verifiedOffers.js), never by title containment.
--   shopping   No partner identified yet. Do not invent one.
create or replace view public.wf_revenue_lanes
with (security_invoker = true) as
with covered as (select distinct entity_id from public.wf_revenue_coverage where entity_type='place')
select
  case i.category
    when 'hotels'      then '1. hotels / stay22 (geo, no matching needed)'
    when 'food'        then '2. food / clipp (per-merchant certificate)'
    when 'nightlife'   then '2. nightlife / clipp (per-merchant certificate)'
    when 'attractions' then '3. attractions / tiqets + klook + UT + viator (resolver)'
    when 'beach'       then '3. beach / viator activities (resolver, geo-gated)'
    else '4. shopping / no partner identified'
  end as lane,
  i.category,
  count(*)                                                          as cards,
  count(*) filter (where c.entity_id is not null)                   as reachable_today,
  count(*) - count(*) filter (where c.entity_id is not null)        as unlockable,
  count(*) filter (where i.lat is not null and i.lng is not null)   as has_coordinates
from public.wf_inventory i
left join covered c on c.entity_id = i.place_id
group by 1, i.category
order by unlockable desc;

comment on view public.wf_revenue_lanes is
  'Revenue work queue by category. "unlockable" is cards that cannot earn today. Partner per lane is chosen by whether that partner MATCHING MECHANISM can physically reach those cards, which is the mistake wf_affiliate_coverage made.';

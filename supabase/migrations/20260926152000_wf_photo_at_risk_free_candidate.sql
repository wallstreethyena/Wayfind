-- Keep the reporting risk view honest while giving the free-photo worker an
-- ACTIONABLE queue that cannot be starved by terminal decisions.
//
// Production incident, 2026-09-26:
// wf_photo_at_risk contained ~5.1k live cached Google-photo places. The hourly
// worker fetched only the first 1000 by earliest expiry, then filtered out any
// place that already had a wf_place_photo row. Once those first 1000 were all
// decided/rejected, every run reported "at-risk 0/1000 ... 1000 already
// covered" and never reached later undecided places.
//
// wf_photo_at_risk remains the reporting superset. This worker view keeps only
// places with no decision yet, plus the one legacy rejection explicitly
// allowed to replay through the newer direct-Commons resolver. Terminal
// rejected rows remain visible in wf_photo_at_risk, but can no longer occupy
// every slot in the worker's capped read.
create or replace view public.wf_photo_at_risk_free_candidate
with (security_invoker = true) as
select
  i.place_id,
  i.name,
  i.category,
  min(c.exp) as earliest_expiry
from public.wf_places_cache c
join public.wf_inventory i
  on i.place_id = split_part(split_part(c.k, '|', 2), '/', 2)
left join public.wf_place_photo p
  on p.place_id = i.place_id
where c.k like 'photo|places/%'
  and c.exp > now()
  and (
    p.place_id is null
    or (
      p.status = 'rejected'
      and p.source_ref = 'rejected:no_wiki_candidate'
    )
  )
group by i.place_id, i.name, i.category
order by earliest_expiry asc;

revoke all on public.wf_photo_at_risk_free_candidate from anon, authenticated;
grant select on public.wf_photo_at_risk_free_candidate to service_role;

comment on view public.wf_photo_at_risk_free_candidate is
  'Actionable free-photo worker queue derived from wf_photo_at_risk: live cached Google-photo places that either have no wf_place_photo decision yet or hold the one legacy rejected:no_wiki_candidate verdict eligible for the direct-Commons replay. Other terminal rejected rows stay visible in wf_photo_at_risk for risk truth but are excluded here so the hourly free-photo worker cannot spend every run rereading already-decided places. Successful or terminal decisions automatically leave this view.';

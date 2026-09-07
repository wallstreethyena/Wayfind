-- wf_wikipedia_popularity_quarantine — a perfect title match is not the same
-- entity, and the stored table already has 22 rows that prove it.
--
-- THE DEFECT (claude/wayfind-AUDIT-wikipedia-enrichment-failure-population-
-- 2026-09-07.md, owner project doc). Of the 413 existing wf_place_popularity
-- rows with source='wikipedia', 22 are local businesses (restaurant, cafe,
-- bar, shop primary_types) carrying 5,000+ 30-day pageviews -- a magnitude
-- no genuine local venue produces (a real local signal looks like Cracker
-- Country at 867 or Mote Marine at 570). 19 of those 22 are stored at
-- match_confidence >= 0.99, because a one-word venue name matched a famous
-- UNRELATED article perfectly:
--   Annapurna (vegetarian_restaurant)   -> Annapurna, the Himalayan massif      42,235 views  conf 1.00
--   Petrichor (coffee_shop)             -> Petrichor, the smell of rain        39,890 views  conf 1.00
--   June (mexican_restaurant)           -> June, the month                     19,762 views  conf 1.00
--   River's Edge (zoo)                  -> River's Edge, a 1986 film           15,532 views  conf 1.00
--   Eyz Wide Shut (night_club)          -> Eyes Wide Shut, the Kubrick film   149,566 views  conf 0.67
--   Triple Crown Cafe (bar)             -> Triple Crown (baseball)             26,393 views  conf 0.67
--   By The Bay (bar_and_grill)          -> By the Way, the RHCP album          16,289 views  conf 0.67
-- plus 15 more of the same shape, and 8 chain-brand rows (Raising Cane's,
-- Culver's, Jersey Mike's Subs x4, Dave's Hot Chicken, Auntie Anne's x2,
-- Cold Stone Creamery x2) where the matched article is real but is the
-- NATIONAL company page, not this outlet -- its pageviews carry zero signal
-- about the one location wf_inventory is scoring.
--
-- match_confidence measures STRING similarity, not subject identity, and
-- wf_place_popularity_scored (percent_rank() partitioned by metro+source
-- over metric_value) cannot tell the difference: these 22 rows sit 20-200x
-- above a genuine local pageview count, so in a popularity-weighted rank
-- they do not add noise, they dominate every food/nightlife rail they touch.
--
-- CROSS-CHECKED against the identity-verification checks this same session
-- adds to lib/popularity.js (disambiguation / redirect-target similarity /
-- chain-brand short-description / geographic agreement / place-type
-- evidence, see fetchWikipedia): every one of these 22 rows was re-run
-- live against the real MediaWiki API and every one FAILS at least one
-- check -- 22/22, not a coincidence. The two defenses (this quarantine's
-- mechanical magnitude+type predicate, and the new per-fetch identity
-- checks) agree independently on the same set.
--
-- THE PREDICATE, stated so a reviewer can re-derive the 22 without reading
-- names off a table: source = 'wikipedia', metric_value >= 5000 (an order of
-- magnitude above the largest genuine local figure measured, Cracker
-- Country at 867), and the place's primary_type is NOT one of the
-- attraction-class types a real high-traffic Wikipedia article is
-- plausible for (museum, zoo, aquarium, park class, aquarium, landmark,
-- monument, tourist_attraction, castle/fort, etc — the same class list the
-- eligibility pre-filter in this session's other migration uses, kept
-- in sync deliberately). Applied directly below; the owner can re-run the
-- SELECT form of this UPDATE at any time to prove the set is still exactly
-- these rows and nothing has silently drifted onto or off of it.
--
-- THE FIX: quarantine, not delete. The owner's explicit instruction: "these
-- rows cannot remain available to the ranker while you work. Preserve them
-- for audit evidence, but exclude them from wf_place_popularity_scored /
-- ranking." wf_place_popularity gets a reversible flag (quarantined,
-- quarantine_reason) instead of a DELETE -- the raw evidence (which title
-- matched, at what confidence, with what pageviews) stays queryable for as
-- long as anyone needs to point at exactly what went wrong. Un-quarantining
-- is a single UPDATE ... SET quarantined = false, not a re-fetch.
-- wf_place_popularity_scored (the ONLY thing any ranking/serving path
-- reads, per its own header comment in lib/popularity.js) gets the one-line
-- exclusion; wf_place_popularity itself, and every direct query against it
-- for audit purposes, is untouched.
--
-- Jersey Mike's Subs (4 rows, one per outlet, identical 19,788-view figure)
-- IS the same class: a national chain-brand Wikipedia article, not
-- individual-outlet signal, same as Raising Cane's/Culver's/Cold Stone/
-- Auntie Anne's above. All 4 rows are caught by the predicate below without
-- special-casing the name.

alter table public.wf_place_popularity
  add column if not exists quarantined boolean not null default false,
  add column if not exists quarantine_reason text;

comment on column public.wf_place_popularity.quarantined is
  'True when this row is known-poisoned evidence (wrong Wikipedia entity, or a chain-brand article standing in for one outlet) that must never reach the ranker. Set by explicit, reviewable migration/audit action only -- never by the cron fetcher itself, which instead simply does not WRITE a row it cannot verify (see lib/popularity.js identity checks, 2026-09-07). Reversible: flip back to false to restore a row to ranking, no re-fetch needed. Excluded in wf_place_popularity_scored, read everywhere else unfiltered for audit.';
comment on column public.wf_place_popularity.quarantine_reason is
  'Free-text note on WHY a quarantined row was pulled from ranking -- for a human reading the table, not machine-parsed.';

-- THE QUARANTINE. Mechanical, re-derivable predicate (see header) -- not a
-- hand-typed place_id list. Measured to select exactly 22 rows at the time
-- this migration was authored (2026-09-07); a reviewer can confirm with:
--   select count(*) from wf_place_popularity p join wf_inventory i using (place_id)
--   where p.source='wikipedia' and p.metric_value >= 5000
--     and i.primary_type not in (<the same list below>);
update public.wf_place_popularity p
set quarantined = true,
    quarantine_reason = 'wikipedia_local_business_pageview_outlier -- primary_type is not an attraction-class type, but metric_value is 5,000+ pageviews (Cracker Country, the largest verified GENUINE local signal, is 867). Re-audited 2026-09-07 against the new identity checks in lib/popularity.js: this row fails at least one of them (disambiguation / redirect-to-unrelated / chain-brand short description / geographic mismatch / no positive place-type evidence).'
from public.wf_inventory i
where p.place_id = i.place_id
  and p.source = 'wikipedia'
  and p.metric_value >= 5000
  and i.primary_type not in (
    'museum','art_museum','history_museum','zoo','wildlife_park','wildlife_refuge','aquarium',
    'state_park','national_park','botanical_garden','historical_landmark','landmark','monument',
    'tourist_attraction','nature_preserve','art_gallery','visitor_center','amusement_park',
    'amusement_center','water_park','library','university','stadium','arena',
    'performing_arts_theater','beach','city_park','castle','fort','observatory','historical_place'
  );

-- THE RANKER-FACING FILTER. Same shape as the underlying view (see
-- wf_place_popularity_scored definition, unchanged apart from this one
-- added predicate on the base CTE) -- percent_rank() partitioned by
-- metro+source over metric_value, now computed only over non-quarantined
-- rows so a quarantined outlier cannot skew the percentile of every OTHER
-- row in its metro+source bucket either.
create or replace view public.wf_place_popularity_scored
with (security_invoker = true) as
with ranked as (
  select p.place_id,
         i.metro,
         p.source,
         percent_rank() over (partition by i.metro, p.source order by p.metric_value) as pct,
         p.match_confidence
  from wf_place_popularity p
  join wf_inventory i using (place_id)
  where p.metric_value is not null
    and not coalesce(p.quarantined, false)
)
select place_id,
       metro,
       avg(pct) as tier2_popularity,
       max(pct) as tier2_popularity_best,
       count(*) as sources_count,
       jsonb_object_agg(source, round(pct::numeric, 3)) as by_source
from ranked
group by place_id, metro;

grant select on public.wf_place_popularity_scored to anon, authenticated, service_role;

comment on view public.wf_place_popularity_scored is
  'Metro-relative percent-rank of wf_place_popularity, normalized per source. The ONLY popularity read any ranking/serving path should use (lib/popularity.js header). 2026-09-07: excludes quarantined rows (wrong-entity Wikipedia matches, chain-brand articles standing in for one outlet) so a 20-200x pageview outlier cannot dominate its metro+source percentile -- see 20260907_wf_wikipedia_popularity_quarantine.sql for the incident and the exact predicate.';

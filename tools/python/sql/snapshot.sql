-- Read-only single-statement export. No editorial prose or credentials.
with clock as (select statement_timestamp() as until),
places as (
select i.place_id, i.name, i.lat, i.lng, i.metro, i.category, i.status,
       i.excluded, i.needs_review, e.place_id is not null as editorial_exists,
       e.verified, cardinality(e.issues) > 0 as has_issues,
       coalesce(char_length(btrim(e.hook)), 0) as hook_chars,
       coalesce(char_length(btrim(e.why_here)), 0) as why_chars,
       (select count(*)::integer from jsonb_array_elements(
          case when jsonb_typeof(e.facts) = 'array' then e.facts else '[]'::jsonb end
        ) f where coalesce(f->>'claim','') <> ''
          and jsonb_typeof(f->'source') = 'string'
          and (f->>'source') ~ '^https?://') as sourced_facts
from public.wf_inventory i
left join public.wf_editorial e using (place_id)
order by i.place_id
),
ledger as (select month, sku, used, cap from public.wf_spend_ledger order by month, sku),
jobs as (select id, job, ran_at, attempted, succeeded, failed
from public.wf_job_pulse where ran_at >= (select until - interval '7 days' from clock) and ran_at < (select until from clock)
order by ran_at, id)
select jsonb_build_object('schema_version',1,'source_kind','production','scope','all wf_inventory rows','consistency','single_statement','captured_at',(select until from clock),'since',(select until - interval '7 days' from clock),'until',(select until from clock),'expected_counts',jsonb_build_object('places',(select count(*) from places),'ledger',(select count(*) from ledger),'jobs',(select count(*) from jobs)),'datasets',jsonb_build_object('places',jsonb_build_object('columns','["place_id", "name", "lat", "lng", "metro", "category", "status", "excluded", "needs_review", "editorial_exists", "verified", "has_issues", "hook_chars", "why_chars", "sourced_facts"]'::jsonb,'rows',(select coalesce(jsonb_agg(jsonb_build_array(place_id,name,lat,lng,metro,category,status,excluded,needs_review,editorial_exists,verified,has_issues,hook_chars,why_chars,sourced_facts)), '[]'::jsonb) from places)),'ledger',jsonb_build_object('columns','["month", "sku", "used", "cap"]'::jsonb,'rows',(select coalesce(jsonb_agg(jsonb_build_array(month,sku,used,cap)), '[]'::jsonb) from ledger)),'jobs',jsonb_build_object('columns','["id", "job", "ran_at", "attempted", "succeeded", "failed"]'::jsonb,'rows',(select coalesce(jsonb_agg(jsonb_build_array(id,job,ran_at,attempted,succeeded,failed)), '[]'::jsonb) from jobs)))) as snapshot;

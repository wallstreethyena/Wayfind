-- Previously unattempted operating businesses. An unretained Places photo
-- reference is not a usable cover. The service also excludes its exact-ID
-- curated file registry in the REST query before LIMIT.
create or replace view public.wf_photo_business_free_candidate
with (security_invoker = true) as
with uncovered as (
  select i.place_id, i.name, i.lat, i.lng, i.category, i.tags,
    coalesce(nullif(btrim(i.postal_city), ''), nullif(btrim(i.locality), '')) as city
  from public.wf_inventory i
  where i.category in ('food', 'nightlife', 'shopping', 'hotels')
    and i.status = 'OPERATIONAL' and i.excluded is not true
    and nullif(btrim(i.name), '') is not null
    and i.lat between -90 and 90 and i.lng between -180 and 180
    and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id)
    and not exists (
      select 1 from public.wf_photo_repair_queue q
      where q.place_id = i.place_id and q.status in ('open', 'budget_blocked')
    )
    and not exists (
      select 1 from public.wf_google_photo_store g
      join storage.objects o on o.bucket_id = 'google-place-photos' and o.name = g.storage_path
      where g.place_id = i.place_id and g.state = 'ready'
    )
    and not exists (
      select 1
      from (values (btrim(i.signals->>'photo_url')), (btrim(i.signals->>'photoUrl')), (btrim(i.signals->>'photo'))) v(url)
      where (v.url ~ '^/[^/]' or v.url ~* '^https://[^/[:space:]]+')
        and v.url !~* '^/api/photo'
        and v.url !~* '(^|[/.])(www[.])?(images[.])?pexels[.]com([^[:alnum:]_]|$)|/api/(market|stock)-photo([?]|$)|/wf-photo-fallback[.]svg([?]|$)'
        and v.url !~* '^https://([^/:?#]+[.])?googleapis[.]com([/:?#]|$)'
        and v.url !~* '^https://(upload|commons)[.]wikimedia[.]org([/:?#]|$)'
    )
    and not exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(i.signals->'photo_gallery') = 'array'
        then i.signals->'photo_gallery' else '[]'::jsonb end) g
      cross join lateral (select btrim(coalesce(nullif(g->>'url',''),g->>'vault_url')) as url) f
      where jsonb_typeof(g) = 'object'
        and nullif(g->>'haunt_key','') is null and jsonb_typeof(g->'christmas_keys') is distinct from 'array'
        and nullif(btrim(g->>'license'),'') is not null and lower(btrim(g->>'license')) <> 'none'
        and nullif(btrim(coalesce(nullif(g->>'attribution_text',''),g->>'credit')),'') is not null
        and btrim(coalesce(nullif(g->>'attribution_url',''),g->>'source_ref')) ~* '^https?://[^/[:space:]]+'
        and position('..' in f.url) = 0
        and (f.url ~* '^/(place-photos|places)/[a-z0-9_./-]+[.](jpe?g|png|webp|avif)$'
          or f.url ~* '^https://(www[.])?gowayfind[.]com/(place-photos|places)/[a-z0-9_./-]+[.](jpe?g|png|webp|avif)([?#].*)?$'
          or f.url ~* '^https://[a-z0-9.-]+[.]supabase[.]co/storage/v1/object/public/place-photos/[a-z0-9_./%~-]+[.](jpe?g|png|webp|avif)([?#].*)?$')
    )
)
select uncovered.*, row_number() over (partition by category order by place_id) as category_position
from uncovered;

revoke all on public.wf_photo_business_free_candidate from public, anon, authenticated;
grant select on public.wf_photo_business_free_candidate to service_role;
comment on view public.wf_photo_business_free_candidate is
  'Undecided, operational, non-excluded businesses with known coordinates, no open repair, and no confirmed stored, direct or licensed general gallery cover. Order by category_position,category,place_id for a bounded balanced read.';

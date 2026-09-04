-- Repair production schema drift: an older wf_lunch_dish_images table existed
-- before the image_url/source_url migration, so CREATE TABLE IF NOT EXISTS did
-- not add the newer columns and every cron upsert failed.
alter table public.wf_lunch_dish_images
  add column if not exists image_url text,
  add column if not exists source_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wf_lunch_dish_images_image_url') then
    alter table public.wf_lunch_dish_images
      add constraint wf_lunch_dish_images_image_url check (image_url is null or image_url ~ '^https?://');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wf_lunch_dish_images_source_url') then
    alter table public.wf_lunch_dish_images
      add constraint wf_lunch_dish_images_source_url check (source_url is null or source_url ~ '^https?://');
  end if;
end $$;

alter table public.wf_lunch_dish_images enable row level security;
revoke all on public.wf_lunch_dish_images from anon, authenticated;
grant all on public.wf_lunch_dish_images to service_role;

-- Permanent editorial is refreshed in place only after three weeks. The route
-- keeps the old verified row untouched unless a replacement passes sourcing
-- and verification, so provider failures cannot make published copy vanish.
create index if not exists wf_editorial_verified_written_idx
  on public.wf_editorial (written_at)
  where verified is true;

create or replace function public.wf_atlas_stale(p_category text, p_metros text[], p_limit integer)
returns table(place_id text, name text, metro text, category text, primary_type text,
              lat double precision, lng double precision, rating numeric, reviews integer)
language sql
stable
set search_path to 'public'
as $function$
  select i.place_id, i.name, i.metro, i.category, i.primary_type, i.lat, i.lng,
         nullif(i.signals->>'rating','')::numeric as rating,
         coalesce(nullif(i.signals->>'reviews','')::int, 0) as reviews
  from public.wf_editorial e
  join public.wf_inventory i on i.place_id = e.place_id
  where e.verified is true
    and e.written_at < now() - interval '21 days'
    and i.status = 'OPERATIONAL'
    and i.metro = any(p_metros)
    and (p_category is null or p_category = '' or i.category = p_category)
  order by e.written_at asc, coalesce(nullif(i.signals->>'reviews','')::int, 0) desc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$function$;

revoke all on function public.wf_atlas_stale(text, text[], integer) from public, anon, authenticated;
grant execute on function public.wf_atlas_stale(text, text[], integer) to service_role;

comment on function public.wf_atlas_stale(text, text[], integer) is
  'Verified operational Atlas editorial older than 21 days, oldest first. Service-role only.';

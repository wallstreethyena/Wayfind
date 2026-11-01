-- Reorder signals.photo_gallery to follow signals.photos.
-- Cards whose gallery cover is not the card cover (photos[0]) are the rows
-- this changes. The set is whatever is mismatched when this runs, not a
-- hardcoded list. Distinct gallery photos that are not in photos stay at
-- the end, in their previous order.
--
-- The snapshot of each changed gallery is inserted before the reorder.
-- Running this again does not overwrite that snapshot. Undo:
-- supabase/photo-batches/2026-11-01/fix_cover_order_undo.sql
--
-- Does not insert places. Service role only. The backup table has RLS on
-- and no anon policy.

begin;

create table if not exists public.wf_photo_gallery_order_backup_20261101 (
  place_id text primary key,
  photo_gallery jsonb not null,
  photos jsonb not null,
  taken_at timestamptz not null default now()
);

alter table public.wf_photo_gallery_order_backup_20261101 enable row level security;

insert into public.wf_photo_gallery_order_backup_20261101 (place_id, photo_gallery, photos)
select i.place_id, i.signals->'photo_gallery', i.signals->'photos'
from public.wf_inventory i
where jsonb_typeof(i.signals->'photos') = 'array'
  and jsonb_typeof(i.signals->'photo_gallery') = 'array'
  and jsonb_array_length(i.signals->'photos') > 0
  and jsonb_array_length(i.signals->'photo_gallery') > 0
  and coalesce(
        i.signals->'photo_gallery'->0->>'url',
        i.signals->'photo_gallery'->0->>'vault_url',
        case when jsonb_typeof(i.signals->'photo_gallery'->0) = 'string' then i.signals->'photo_gallery'->>0 else null end
      )
      is distinct from (i.signals->'photos'->>0)
on conflict (place_id) do nothing;

update public.wf_inventory i
set signals = jsonb_set(i.signals, '{photo_gallery}', r.gallery)
from (
  select s.place_id,
         (
           select coalesce(jsonb_agg(g.elem order by m.pos nulls last, g.pos), '[]'::jsonb)
           from jsonb_array_elements(s.signals->'photo_gallery') with ordinality as g(elem, pos)
           left join (
             select url, min(pos) as pos
             from jsonb_array_elements_text(s.signals->'photos') with ordinality as p(url, pos)
             group by url
           ) m
             on m.url = coalesce(
                  g.elem->>'url',
                  g.elem->>'vault_url',
                  case when jsonb_typeof(g.elem) = 'string' then g.elem #>> '{}' else null end
                )
         ) as gallery
  from public.wf_inventory s
  join public.wf_photo_gallery_order_backup_20261101 b on b.place_id = s.place_id
) r
where i.place_id = r.place_id
  and i.signals->'photo_gallery' is distinct from r.gallery;

commit;

-- PENDING APPLY. Not applied by the agent that wrote it.
-- Declared in scripts/migration-pending-apply.json.
--
-- Canary production data integrity (run 40858615532 and the later run on
-- 8ada0cda):
--   Holmes Beach is stored twice, 164 m apart, so one place renders as two cards.
--   Scream A Geddon Horror Park and Sir Henry's Haunted Trail store a county
--   name with a trailing County suffix. The convention is the bare name
--   (Pinellas, not Pinellas County).
--
-- KEEPER  ChIJaWeoBbURw4gRDYfwKuwOVW0  Holmes Beach  beach  344 reviews
--         ready Google photo plus a rejected copy of the locator map
-- TWIN    ChIJ2VOdeTYQw4gRALlkLfzdBwc  Holmes Beach  locality  no reviews
--         the active Wikimedia locator map, plus its own ready Google photo
--
-- The twin is soft-excluded (status EXCLUDED, excluded true,
-- exclusion_reason duplicate_of:<keeper>, locked true). Nothing is deleted.
-- The twin's Google photo row stays in wf_google_photo_store: that table is
-- one row per place_id and the object path is tied to that id, in a private
-- bucket, so the bytes and credit are kept and are not destroyed. The keeper
-- already has its own ready Google photo, which remains the card photo.
-- The twin's active Wikimedia locator map is copied onto the keeper's
-- signals.photo_gallery so that licensed photo lives on the surviving record.
-- The keeper's own wf_place_photo row stays rejected: it is the same locator
-- map, and activating it would make that map the free-lane fallback for a beach.
--
-- County rows: Pasco County -> Pasco, Hillsborough County -> Hillsborough.
-- Repo seed copy for Sir Henry's already says Hillsborough. This only repairs
-- the inventory rows the canary reads.
--
-- REVERSE: supabase/data-fixes/20261029223000_holmes_beach_one_card_and_county_suffix_REVERSE.sql

do $$
declare
  keeper constant text := 'ChIJaWeoBbURw4gRDYfwKuwOVW0';
  twin   constant text := 'ChIJ2VOdeTYQw4gRALlkLfzdBwc';
  k record;
  t record;
  n integer;
  gallery jsonb;
begin
  select place_id, name, metro, status, excluded, locked, lat, lng, primary_type
    into strict k
    from public.wf_inventory
   where place_id = keeper
     for update;
  if k.name is distinct from 'Holmes Beach'
     or k.metro is distinct from 'manatee-sarasota'
     or k.status is distinct from 'OPERATIONAL'
     or coalesce(k.excluded, false)
     or coalesce(k.locked, false)
     or k.primary_type is distinct from 'beach' then
    raise exception 'holmes beach dedupe: keeper % is not the serving beach card', keeper;
  end if;

  select place_id, name, metro, status, excluded, locked, exclusion_reason, lat, lng, primary_type
    into strict t
    from public.wf_inventory
   where place_id = twin
     for update;
  if t.name is distinct from 'Holmes Beach'
     or t.metro is distinct from 'manatee-sarasota'
     or t.status is distinct from 'OPERATIONAL'
     or coalesce(t.excluded, false)
     or t.exclusion_reason is not null
     or coalesce(t.locked, false)
     or t.primary_type is distinct from 'locality' then
    raise exception 'holmes beach dedupe: twin % is not the serving locality card', twin;
  end if;

  if round((
    (abs(k.lat - t.lat) * 111320)
  )::numeric, 0) not between 100 and 250 then
    raise exception 'holmes beach dedupe: pins are not the 164 m pair the canary reported';
  end if;

  if not exists (
    select 1 from public.wf_place_photo
     where place_id = twin and status = 'active' and source = 'wikimedia'
       and source_ref = 'File:Manatee_County_Florida_Incorporated_and_Unincorporated_areas_Holmes_Beach_Highlighted.svg'
  ) then
    raise exception 'holmes beach dedupe: twin % has no active locator-map photo to keep', twin;
  end if;

  select jsonb_build_object(
    'url', 'https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/' || p.storage_path,
    'bytes', p.bytes,
    'width', p.width,
    'height', p.height,
    'source', p.source,
    'license', p.license,
    'source_ref', p.source_ref,
    'content_type', p.content_type,
    'original_url', p.image_url,
    'storage_path', p.storage_path,
    'attribution_url', p.attribution_url,
    'attribution_text', p.attribution_text
  ) into gallery
    from public.wf_place_photo p
   where p.place_id = twin and p.status = 'active';

  update public.wf_inventory
     set signals = jsonb_set(
           coalesce(signals, '{}'::jsonb),
           '{photo_gallery}',
           coalesce(signals->'photo_gallery', '[]'::jsonb) || jsonb_build_array(gallery),
           true
         )
   where place_id = keeper
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(signals->'photo_gallery', '[]'::jsonb)) e
        where e->>'source_ref' = gallery->>'source_ref'
     );
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'holmes beach dedupe: expected to attach the locator map to the keeper, changed %', n;
  end if;

  update public.wf_inventory
     set status = 'EXCLUDED',
         excluded = true,
         exclusion_reason = 'duplicate_of:' || keeper,
         locked = true
   where place_id = twin
     and name = 'Holmes Beach'
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false
     and exclusion_reason is null
     and coalesce(locked, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'holmes beach dedupe: expected exactly 1 twin excluded, got %', n;
  end if;

  update public.wf_inventory
     set county = 'Pasco'
   where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM'
     and name = 'Scream A Geddon Horror Park'
     and county = 'Pasco County'
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'county suffix: Scream A Geddon was not Pasco County, changed %', n;
  end if;

  update public.wf_inventory
     set county = 'Hillsborough'
   where place_id = 'ChIJeZM_F1A23YgRFICuRhA_pIo'
     and name = 'Sir Henry''s Haunted Trail'
     and county = 'Hillsborough County'
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'county suffix: Sir Henry''s Haunted Trail was not Hillsborough County, changed %', n;
  end if;
end
$$;

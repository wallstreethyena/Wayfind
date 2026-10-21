-- 20261021030000_wf_inventory_coords_independent_verified_REVERSE.sql
-- REVERSE of the forward pass: removes only entries with source='wikidata'
-- and method='wikidata-p625-official-address-verified' from the listed rows. Nothing else changes.
begin;

create temp table _wf_ic_rev (place_id text primary key) on commit drop;
insert into _wf_ic_rev (place_id) values
  ('ChIJ_37IauQ_w4gRz03lc0QInIE'),
  ('ChIJ-6lKAInEwogRVnf5NBtjZss'),
  ('ChIJ6_YRRRJAw4gRE5XF42pZOxo'),
  ('ChIJ6y2dx9g_w4gRWoZIRhLk-JI'),
  ('ChIJ7aIAgJd654gRjUN8WsPaaI4'),
  ('ChIJ9RHZGx6H3YgRnWVYIWsHNPM'),
  ('ChIJCXAq5_DEwogRjTPE2xlsZtE'),
  ('ChIJd9nFxyC02YgRVdtnh8Obwp8'),
  ('ChIJlcQil-Pj2ogRZXbB55ldZcQ'),
  ('ChIJlR-NjATIwogRoSE1MsVTpmA'),
  ('ChIJlRUlG4nEwogRJOgu0Hf2n54'),
  ('ChIJM6cv59Pn2YgRdXaKYZKWWms'),
  ('ChIJNwQxUnFDw4gRlEruVgcCmu0'),
  ('ChIJo2bql5B654gR_ITN9PGhBbU'),
  ('ChIJu_e4BnTI2YgREAOg3GxMK8g'),
  ('ChIJVVUNg8JB24gRo5VjblNO_c8'),
  ('ChIJy6ESWITDwogReu72OLauRMM'),
  ('ChIJy76z4HY9w4gROaX_C6lQu8g'),
  ('ChIJz8e7TVLEwogRBeybvscHnD4');

update public.wf_inventory t
   set independent_coords = nullif(coalesce((
         select jsonb_agg(e) from jsonb_array_elements(t.independent_coords) e
          where not (e->>'source' = 'wikidata' and e->>'method' = 'wikidata-p625-official-address-verified')), '[]'::jsonb), '[]'::jsonb)
  from _wf_ic_rev r
 where t.place_id = r.place_id
   and jsonb_typeof(t.independent_coords) = 'array'
   and exists (select 1 from jsonb_array_elements(t.independent_coords) e
                where e->>'source' = 'wikidata' and e->>'method' = 'wikidata-p625-official-address-verified');

commit;

-- 20261021030000_wf_inventory_coords_independent_verified_REVERSE.sql (part 2)
-- REVERSE of the forward pass: removes only entries with source='official_venue'
-- and method='census-geocoder-official-address-reverified' from the listed rows. Nothing else changes.
begin;

create temp table _wf_ic_rev (place_id text primary key) on commit drop;
insert into _wf_ic_rev (place_id) values
  ('ChIJ0UaxcHon5IgRtIDfdNZ5UsQ'),
  ('ChIJ5UOOwKux5YgRAmO1YNbhTc0'),
  ('ChIJ6_YRRRJAw4gRE5XF42pZOxo'),
  ('ChIJ6y2dx9g_w4gRWoZIRhLk-JI'),
  ('ChIJ7aIAgJd654gRjUN8WsPaaI4'),
  ('ChIJheIoirLAkIgRPxCpsjJZlYs'),
  ('ChIJKVDd7v_bkIgRv0FaG2bnP9g'),
  ('ChIJlRUlG4nEwogRJOgu0Hf2n54'),
  ('ChIJM5duwu3h2ogRw33TpV_VYtI'),
  ('ChIJM6cv59Pn2YgRdXaKYZKWWms'),
  ('ChIJQZRp15bDwogReY6sMTk-YWg'),
  ('ChIJT8lyCbL07IgR7bBS2PG4XQI'),
  ('ChIJVVUNg8JB24gRo5VjblNO_c8'),
  ('ChIJX0UJnszx3ogRKqv856yKO_s'),
  ('ChIJy6ESWITDwogReu72OLauRMM'),
  ('ChIJy76z4HY9w4gROaX_C6lQu8g');

update public.wf_inventory t
   set independent_coords = nullif(coalesce((
         select jsonb_agg(e) from jsonb_array_elements(t.independent_coords) e
          where not (e->>'source' = 'official_venue' and e->>'method' = 'census-geocoder-official-address-reverified')), '[]'::jsonb), '[]'::jsonb)
  from _wf_ic_rev r
 where t.place_id = r.place_id
   and jsonb_typeof(t.independent_coords) = 'array'
   and exists (select 1 from jsonb_array_elements(t.independent_coords) e
                where e->>'source' = 'official_venue' and e->>'method' = 'census-geocoder-official-address-reverified');

commit;

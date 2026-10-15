-- 20261015180100_wf_inventory_official_address_coords_corroborated_REVERSE.sql
-- REVERSE of the forward pass: removes only entries with source='official_venue'
-- and method='census-geocoder-official-address' from the listed rows. Nothing else changes.
begin;

create temp table _wf_ic_rev (place_id text primary key) on commit drop;
insert into _wf_ic_rev (place_id) values
  ('ChIJ0UaxcHon5IgRtIDfdNZ5UsQ'),
  ('ChIJ1YBgZHRAw4gRorfVkB1B6bY'),
  ('ChIJ5UOOwKux5YgRAmO1YNbhTc0'),
  ('ChIJ6_YRRRJAw4gRE5XF42pZOxo'),
  ('ChIJ62qtuiVBw4gRFdwvl9Z4X_Y'),
  ('ChIJ68SLYriZ54gRaJgw169KqYA'),
  ('ChIJ6y2dx9g_w4gRWoZIRhLk-JI'),
  ('ChIJ7aIAgJd654gRjUN8WsPaaI4'),
  ('ChIJ8bW6uvTrwogRUorwK25q9v0'),
  ('ChIJaVDYNb5Bw4gRbV2ffQ-VTfQ'),
  ('ChIJB_VL5xJAw4gRY58y23x1wBw'),
  ('ChIJBQ5SjLHGwogRL4X19g4J5tI'),
  ('ChIJCfCH_iP7wogRE6a2s11VkTo'),
  ('ChIJcYO7IYJ854gReXfj_yDGexM'),
  ('ChIJDahUeGJ654gRTbXyn3JDd0U'),
  ('ChIJEV8IHeTRwogRvWT4NjcJZBI'),
  ('ChIJheIoirLAkIgRPxCpsjJZlYs'),
  ('ChIJHYWhzLpbw4gR-dyWVALZtfw'),
  ('ChIJI-aAsE-32YgRlQrq8LqdUa8'),
  ('ChIJJQVMQuJXw4gRhD0CpEOETGo'),
  ('ChIJKVDd7v_bkIgRv0FaG2bnP9g'),
  ('ChIJkyg5UW6654gRECAKyCherD8'),
  ('ChIJlRUlG4nEwogRJOgu0Hf2n54'),
  ('ChIJlzk1hBl754gR1_reEx766yE'),
  ('ChIJm-1TQ1N-54gRtKSCx6hQ8SU'),
  ('ChIJM5duwu3h2ogRw33TpV_VYtI'),
  ('ChIJM6cv59Pn2YgRdXaKYZKWWms'),
  ('ChIJmy7U4VJ-54gRi1LoS6wwFj0'),
  ('ChIJn2JUR3Bf7IgRDoeGio3YFuE'),
  ('ChIJncyg0v1654gRzcygkvMIsg0'),
  ('ChIJnf4V7fDEwogRSLy2fzGSEvE'),
  ('ChIJNwQxUnFDw4gRlEruVgcCmu0'),
  ('ChIJNZFmmIgX3YgRP6hMLXU3Tvw'),
  ('ChIJoVf1MAbFwogRidvzt2obVtY'),
  ('ChIJPTvxtmpAw4gReToYD5mTNwE'),
  ('ChIJQZRp15bDwogReY6sMTk-YWg'),
  ('ChIJS21014vEwogRXMNoxBIrzGg'),
  ('ChIJScJ5bQAZw4gRjNIj9iS5bus'),
  ('ChIJsR6q-JzhwogRr5VNDk-yr4o'),
  ('ChIJSV2_Mo3EwogRc8CZwwOroSs'),
  ('ChIJT8lyCbL07IgR7bBS2PG4XQI'),
  ('ChIJu73by6Rbw4gR857K3YRfLQo'),
  ('ChIJU7bqHVV-54gRJAwZAp5qCpk'),
  ('ChIJUczTK5XC2YgRRt4Jp6N3B70'),
  ('ChIJVVUNg8JB24gRo5VjblNO_c8'),
  ('ChIJW5C20gaI54gRZuH_-8hPQy8'),
  ('ChIJWTX7kWvn3ogRRjQhNzC11RQ'),
  ('ChIJX-E766nhwogR8u_Re6nJTyk'),
  ('ChIJX0UJnszx3ogRKqv856yKO_s'),
  ('ChIJy6ESWITDwogReu72OLauRMM'),
  ('ChIJy76z4HY9w4gROaX_C6lQu8g'),
  ('ChIJy7zze_HEwogRxlL7hirJ2HI'),
  ('ChIJYWfOURm35YgRZ6p-Om4KBNM'),
  ('ChIJYWj9iZ_PwogRQebjN7pJ_Nw'),
  ('ChIJzcd5L6hBw4gRAON6hbly9cE');

update public.wf_inventory t
   set independent_coords = nullif(coalesce((
         select jsonb_agg(e) from jsonb_array_elements(t.independent_coords) e
          where not (e->>'source' = 'official_venue' and e->>'method' = 'census-geocoder-official-address')), '[]'::jsonb), '[]'::jsonb)
  from _wf_ic_rev r
 where t.place_id = r.place_id
   and jsonb_typeof(t.independent_coords) = 'array'
   and exists (select 1 from jsonb_array_elements(t.independent_coords) e
                where e->>'source' = 'official_venue' and e->>'method' = 'census-geocoder-official-address');

commit;

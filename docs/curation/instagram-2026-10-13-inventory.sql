with inserted as (
 insert into public.wf_inventory
 (place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,status,source,needs_review,locked,excluded,secondary_categories,locality,county,last_verified_at,seen_at,refreshed_at)
 values
 ('ChIJgYp-DDIv2YgRH8hrgA3I3pI','South Florida Fair',26.6846008,-80.1913299,'attractions',array[]::text[],array['event_venue'],'event_venue','palm-beach','{"rating":4.4,"reviews":6501}'::jsonb,'OPERATIONAL','creator_curation',false,false,false,array[]::text[],'West Palm Beach','Palm Beach',now(),now(),now()),
 ('ChIJqwCnDja_2YgR0fQINSRA2MM','Miami-Dade County Fair & Exposition, Inc.',25.747259,-80.37252,'attractions',array[]::text[],array['event_venue'],'event_venue','miami-dade','{"rating":4.3,"reviews":3442}'::jsonb,'OPERATIONAL','creator_curation',false,false,false,array[]::text[],'Miami','Miami-Dade',now(),now(),now()),
 ('ChIJUcSOQap_3YgRzKLq5rYIdYI','The Cake Bake Shop by Gwendolyn Rogers',28.3679122,-81.5553633,'food',array[]::text[],array['bakery','restaurant'],'bakery','orlando','{"rating":3.9,"reviews":1693}'::jsonb,'OPERATIONAL','creator_curation',false,false,false,array[]::text[],'Lake Buena Vista','Orange',now(),now(),now()),
 ('ChIJbSWVVp-A54gR-1T7NyCXHgM','Casey''s Corner',28.4179445,-81.5813558,'food',array[]::text[],array['american_restaurant','restaurant'],'american_restaurant','orlando','{"rating":3.8,"reviews":633}'::jsonb,'OPERATIONAL','creator_curation',false,false,false,array[]::text[],'Lake Buena Vista','Orange',now(),now(),now()),
 ('ChIJAcphlZd_3YgRVnw4XgEUJoY','Olivia''s Cafe',28.3751458,-81.5334848,'food',array[]::text[],array['cafe','restaurant'],'cafe','orlando','{"rating":4.4,"reviews":1057}'::jsonb,'OPERATIONAL','creator_curation',false,false,false,array[]::text[],'Lake Buena Vista','Orange',now(),now(),now())
 on conflict (place_id) do nothing
 returning place_id,name,lat,lng,category,metro,signals,status,source,needs_review,excluded,last_verified_at,refreshed_at
) select * from inserted order by name;

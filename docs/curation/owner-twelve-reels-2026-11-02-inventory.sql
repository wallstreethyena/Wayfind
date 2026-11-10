-- Owner intake 2026-11-02, approved by the owner 2026-11-03 ("add rolfs, find the address for what is missing").
-- Two venue identities with no wf_inventory row. Addresses come from the venue's own
-- published source and were matched by the US Census geocoder. Insert only; existing rows are never touched.
-- Rollback: delete from public.wf_inventory where place_id in ('wfadd_rolfs_new_york','wfadd_kenikkei_orlando');
insert into public.wf_inventory (place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,status,source,needs_review,locked,excluded,secondary_categories,locality,county,independent_coords,last_verified_at,seen_at,refreshed_at) values
('wfadd_rolfs_new_york','Rolf''s German Restaurant',40.738087190509,-73.983602279586,'food',array['restaurants','german']::text[],array[]::text[],'restaurant','new-york-ny',
 '{"state":"NY","rating":null,"country":"US","reviews":0,"website":"https://www.rolfsnyc.com/","score_status":"awaiting_verified_rating_signals","creator_reels":["https://www.instagram.com/reel/DfM4775Retf/"],"seasonal_note":"Known for its year round Christmas decorations; it books up fast in the holiday season.","identity_method":"owner_reviewed_native_reel_and_official_address","identity_source":"https://www.nyctourism.com/venues/rolfs/","official_address":"281 3rd Ave, New York, NY 10010"}'::jsonb,
 'OPERATIONAL','owner_verified_official_source',false,false,false,array[]::text[],'New York','New York',
 '[{"lat":40.738087190509,"lng":-73.983602279586,"method":"editor-linked-official-address-census-geocoder","source":"owner_verified","source_url":"https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=281+3rd+Ave%2C+New+York%2C+NY+10010","matched_address":"281 3RD AVE, NEW YORK, NY, 10010"}]'::jsonb,
 now(),now(),now()),
('wfadd_kenikkei_orlando','Kenikkei',28.421559076309,-81.385188349752,'food',array['restaurants','sushi','food-truck']::text[],array[]::text[],'restaurant','orlando',
 '{"state":"FL","rating":null,"country":"US","reviews":0,"website":"https://www.instagram.com/kenikkei/","score_status":"awaiting_verified_rating_signals","creator_reels":["https://www.instagram.com/reel/DfKUE8QxZic/"],"seasonal_note":"Latin fusion sushi food truck. Its own profile lists this address and says it is closed Tuesdays.","identity_method":"owner_reviewed_native_reel_and_official_address","identity_source":"https://www.instagram.com/kenikkei/","official_address":"601 W Taft Vineland Rd, Orlando, FL 32824"}'::jsonb,
 'OPERATIONAL','owner_verified_official_source',false,false,false,array[]::text[],'Orlando','Orange',
 '[{"lat":28.421559076309,"lng":-81.385188349752,"method":"editor-linked-official-address-census-geocoder","source":"owner_verified","source_url":"https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=601+W+Taft+Vineland+Rd%2C+Orlando%2C+FL+32824","matched_address":"601 W TAFT VINELAND RD, ORLANDO, FL, 32824"}]'::jsonb,
 now(),now(),now())
on conflict (place_id) do nothing
returning place_id,name,lat,lng,metro,locality,status;

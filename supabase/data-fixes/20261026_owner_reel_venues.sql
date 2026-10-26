-- Owner-directed intake. Additive and idempotent; no existing venue is rewritten.
-- Evidence: docs/curation/owner-reels-2026-10-26.json.
-- Google-derived street-address coordinates use refreshed_at's normal 30-day clock.
begin;
with incoming(place_id,name,category,primary_type,tags,booking_url,editorial) as (
  values
    ('ChIJ3bfH5t5_54gRmRUyXxTp3ls','Casa Del Despecho','nightlife','karaoke',array['dinner','live-music','karaoke'],'https://www.opentable.com/r/casa-del-despecho-orlando','Latin music, live performances and sing-along nights on International Drive. Check the venue booking page for the current schedule.'),
    ('ChIJK0c85eB_54gRkNYkYGyCWCw','Casa Mezcal','food','mexican_restaurant',array['dinner','mexican','cocktails'],'https://www.opentable.com/restaurant/profile/1541011','Mexican dining and mezcal cocktails at 8267 International Drive. The same address also houses Aphrodisiaco and Casa del Despecho as separate concepts.'),
    ('wfadd_aphrodisiaco_orlando','Aphrodisiaco','nightlife','bar',array['dinner','cocktails','date-night','speakeasy'],'https://www.opentable.com/r/aphrodisiaco-orlando','An intimate speakeasy at 8267 International Drive. The venue booking page lists an 18-plus age policy and an elegant or business casual dress code; check before visiting.')
), added as (
  insert into public.wf_inventory
    (place_id,name,lat,lng,category,primary_type,tags,metro,locality,county,signals,editorial,status,source,needs_review,last_verified_at)
  select i.place_id,i.name,28.4454738,-81.4678174,i.category,i.primary_type,i.tags,'orlando','Orlando','Orange',
    jsonb_build_object(
      'official_address','8267 International Dr, Orlando, FL 32819',
      'official_source',i.booking_url,'booking_url',i.booking_url,
      'identity_source',case when i.place_id like 'wfadd_%' then i.booking_url else 'https://www.google.com/maps/search/?api=1&query=' || replace(i.name,' ','+') || '&query_place_id=' || i.place_id end,
      'identity_method',case when i.place_id like 'wfadd_%' then 'Wayfind-owned ID; business-supplied booking listing and owner screenshot agree on name/address' else 'Google Maps place identity reopened by query_place_id; business booking listing confirms name/address' end,
      'coordinate_source','google_maps','coordinate_precision','shared_street_address',
      'coordinate_source_url','https://www.google.com/maps/search/?api=1&query=Casa+Mezcal&query_place_id=ChIJK0c85eB_54gRkNYkYGyCWCw',
      'owner_intake','2026-10-26-five-reels'
    ),i.editorial,'OPERATIONAL','owner_verified_official_source',false,now()
  from incoming i
  where not exists (select 1 from public.wf_inventory e where e.place_id=i.place_id or (lower(e.name)=lower(i.name) and e.metro='orlando'))
  on conflict (place_id) do nothing
  returning place_id,name,category,metro
)
select * from added;
commit;

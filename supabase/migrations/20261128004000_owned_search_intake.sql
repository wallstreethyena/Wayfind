-- Reviewed official-source intake for #1899 and #1934. The public operator and
-- Census checks took place on November 28 UTC (November 27 in Florida).
-- These are Wayfind IDs. No provider rating, review count or ID was observed.
-- Replaying this migration cannot renew a sighting or overwrite a venue row.
do $$
declare
  spot record;
  checked_at constant timestamptz := '2026-11-28T00:00:00Z';
  census_url constant text := 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=';
  place_gazetteer constant text := 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_gaz_place_12.txt';
  coord_source text;
begin
  for spot in select * from (values
    ('wfadd_srq_sarasota_bradenton_airport', 'Sarasota Bradenton International Airport',
     27.386471623321, -82.554958602954, 'attractions', 'airport', 'manatee-sarasota', 'Sarasota', 'Sarasota',
     '6000 Airport Cir, Sarasota, FL 34243', '6000+Airport+Cir%2C+Sarasota%2C+FL+34243',
     'https://flysrq.com/', 'https://www.scgov.net/Home/Components/BusinessDirectory/BusinessDirectory/42/',
     'Sarasota Bradenton International Airport serves the Sarasota and Bradenton area. The street address is the airport access road.'),
    ('wfadd_tpa_tampa_international_airport', 'Tampa International Airport',
     27.982116506944, -82.534638530215, 'attractions', 'airport', 'tampa', 'Tampa', 'Hillsborough',
     '4100 George J. Bean Parkway, Tampa, FL 33607', '4100+George+J+Bean+Pkwy%2C+Tampa%2C+FL+33607',
     'https://www.tampaairport.com/', 'https://www.tampaairport.com/directions',
     'Tampa International Airport publishes terminal directions and ground transportation information. Its street address is on George J. Bean Parkway.'),
    ('wfadd_siesta_key_area', 'Siesta Key',
     27.274813, -82.549327, 'attractions', 'locality', 'manatee-sarasota', 'Siesta Key', 'Sarasota',
     null, null, 'https://www.visitflorida.com/places-to-go/southwest/siesta-key/',
     'https://www.census.gov/quickfacts/siestakeycdpflorida',
     'Siesta Key is a barrier island in Sarasota County. The map represents the census-designated area.'),
    ('wfadd_misohappy_key_west', 'Misohappy',
     24.555070705577, -81.801608251295, 'food', 'sushi_restaurant', 'keys', 'Key West', 'Monroe',
     '504 Southard St, Key West, FL 33040', '504+Southard+St%2C+Key+West%2C+FL+33040',
     'https://misohappyrestaurant.com/', 'https://order.toasttab.com/online/misohappy-504-southard-st',
     'Misohappy serves sushi and regional Thai food at its Southard Street restaurant in Key West.'),
    ('wfadd_sushi_song_key_west', 'Sushi Song Key West',
     24.551624712861, -81.799568461363, 'food', 'sushi_restaurant', 'keys', 'Key West', 'Monroe',
     '925 Duval St, Key West, FL 33040', '925+Duval+St%2C+Key+West%2C+FL+33040',
     'https://www.sushisong.com/location/key-west', 'https://www.sushisong.com/menu/key-west',
     'The Duval Street branch of Sushi Song lists sushi rolls and sashimi on its Key West menu.')
  ) as s(id, name, lat, lng, category, primary_type, metro, locality, county, address,
         geocode_address, website, identity_source, summary)
  loop
    -- Stop for a reviewer if a live identity has since been imported under another ID.
    if exists (
      select 1 from (
        select place_id, name, lat, lng from public.wf_inventory
        union all select place_id, name, lat, lng from public.wf_place_ids
      ) p where p.place_id <> spot.id and abs(p.lat - spot.lat) < 0.05 and abs(p.lng - spot.lng) < 0.05
        and trim(regexp_replace(lower(p.name), '[^a-z0-9]+',' ','g')) in (
          lower(spot.name), lower(spot.name) || ' srq', lower(spot.name) || ' tpa',
          case spot.id when 'wfadd_sushi_song_key_west' then 'sushi song' when 'wfadd_misohappy_key_west' then 'misohappy sushi and thai' end)
    ) then raise exception 'Check possible duplicate identity for %', spot.name; end if;
    coord_source := case when spot.geocode_address is null then place_gazetteer else census_url || spot.geocode_address end;
    insert into public.wf_inventory (
      place_id, name, lat, lng, category, primary_type, metro, locality, county,
      postal_city, postal_city_source, cuisines, google_types, tags, signals, editorial,
      independent_coords, source, status, needs_review, locked, excluded, last_verified_at, seen_at, refreshed_at
    ) values (
      spot.id, spot.name, spot.lat, spot.lng, spot.category, spot.primary_type, spot.metro, spot.locality, spot.county,
      case when spot.address is not null then spot.locality end, case when spot.address is not null then 'official_source' end,
      case when spot.primary_type='sushi_restaurant' then array['sushi']::text[] else array[]::text[] end,
      array[]::text[], array[]::text[], jsonb_strip_nulls(jsonb_build_object(
        'state','FL', 'country','US', 'website',spot.website, 'identity_source',spot.identity_source,
        'official_address',spot.address, 'score_status',case when spot.primary_type='locality' then 'not_applicable_to_area' else 'awaiting_verified_rating_signals' end,
        'identity_checked_at',checked_at, 'intake_batch','owned_search_20261128'
      )), spot.summary, jsonb_build_array(jsonb_build_object(
        'source','owner_verified', 'method',case when spot.geocode_address is null then 'census-gazetteer-cdp-internal-point' else 'official-address-census-street-interpolation' end,
        'source_url',coord_source, 'lat',spot.lat, 'lng',spot.lng, 'observed_at',checked_at, 'verified',true
      )), 'owner_verified_official_source', 'OPERATIONAL', false, false, false, checked_at, checked_at, checked_at
    ) on conflict (place_id) do nothing;
    if not exists (select 1 from public.wf_inventory i where i.place_id=spot.id and i.name=spot.name and abs(i.lat-spot.lat)<0.001 and abs(i.lng-spot.lng)<0.001) then
      raise exception 'Identity conflict for %', spot.id;
    end if;
  end loop;
end $$;

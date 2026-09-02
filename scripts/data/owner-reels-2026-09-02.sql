-- scripts/data/owner-reels-2026-09-02.sql
--
-- Work order 7 — "everything available everywhere" (owner, 2026-09-02):
-- curated places from the owner's reels get cards wherever they physically
-- are; automated Google spend stays Florida-first (lib/spendGate.js,
-- unaffected by this file). Indexes the 16 place_ids from the owner's reel
-- batch that were not yet in wf_place_ids — 13 out-of-state/out-of-country
-- venues resolved live on gowayfind.com (detail-sheet photo fetches, in
-- exact open order — see the WO7 commit body for the source list) plus 3
-- Florida venues left un-indexed at the end of WO5b (Nueva Cantina Downtown
-- Tampa, All Fired Up Winter Park, All Fired Up Waterford Lakes).
--
-- Universal Studios Hollywood (ChIJzzgyJU--woARcZqceSdQ3dM) is deliberately
-- NOT in this file — the coordinator confirmed it is already in
-- wf_place_ids.
--
-- COORDINATES: no Google Places API access in this session, so every
-- coordinate below comes from a non-Google geocoder — the US Census
-- Bureau's public geocoder (rooftop/address-range level) for US addresses
-- it could resolve, or a named, cited alternate source where the Census
-- TIGER address range did not cover the address. Two rows are flagged
-- below as coarser than rooftop (ZIP/town-centroid) because no rooftop-level
-- non-Google geocoder could be reached for those two specific addresses in
-- this session; the addresses themselves are still exactly what the
-- coordinator gave from the resolved detail-sheet record.
--
-- Applied by the parent via Supabase MCP. This file is not run by any
-- script or CI step in this repo — ON CONFLICT DO NOTHING makes it safe to
-- re-run.

insert into wf_place_ids (place_id, name, lat, lng, category, signals, seen_at) values
  -- 1. Tim's Pumpkin Patch, 2901 Rose Hill Rd, Marietta, NY 13110
  --    US Census geocoder (rooftop/address-range).
  ('ChIJRyvATuoD2okRJNZ_PpKp6GY', 'Tim''s Pumpkin Patch', 42.911613909112, -76.343930201616, 'food',
    jsonb_build_object('reviews', 914), now()),

  -- 2. Harvest Moon Farm & Orchard, 130 Hardscrabble Rd, North Salem, NY 10560
  --    US Census geocoder (rooftop/address-range).
  ('ChIJt-i--GutwokRPyo0w5TWmfo', 'Harvest Moon Farm & Orchard', 41.350013639421, -73.634359161562, 'food',
    jsonb_build_object('reviews', 1722), now()),

  -- 3. Brother Bruno's Pizza, 200 Hamburg Tpke, Wayne, NJ 07470
  --    US Census TIGER has no address-range match for this stretch of
  --    Hamburg Tpke (tried three address spellings). No rooftop-precision
  --    non-Google geocoder was reachable in this session (Nominatim,
  --    Photon and geocode.maps.co all blocked by robots.txt through the
  --    session's fetch proxy; geocode.xyz throttled). Coordinates below are
  --    the 07470 ZIP centroid (unitedstateszipcodes.org, ~6mi radius) —
  --    COARSER THAN ROOFTOP. Good enough to place the pin in Wayne, NJ; not
  --    good enough for a distance-gated rail. Refine with a geocoder that
  --    has API access before this row feeds anything distance-sensitive.
  ('ChIJkSQPf539wokRMWt15Ub6os4', 'Brother Bruno''s Pizza', 40.95, -74.24, 'food',
    jsonb_build_object('reviews', 812), now()),

  -- 4. Cake Your Way, 7007 Islington Ave Unit 10, Vaughan, ON L4L 4T5, Canada
  --    City of Vaughan's own business-directory geocode (ww4.yorkmaps.ca) —
  --    rooftop-level, municipal source, not Google.
  ('ChIJd8uvoLE6K4gRwluO461TMro', 'Cake Your Way', 43.765081, -79.574267, 'food',
    jsonb_build_object('reviews', 244), now()),

  -- 5. Bates Farm, Warrington Rd, Risley, Croft, Warrington WA3 6BN, UK
  --    OpenStreetMap-derived (mapcarta.com) — rooftop-level.
  ('ChIJ08paSdYAe0gR2ACKWXW3m6w', 'Bates Farm', 53.441927, -2.522272, 'food',
    jsonb_build_object('reviews', 173), now()),

  -- 6. Ryan Bros Coffee City Heights, 4465 University Ave, San Diego, CA 92105
  --    US Census geocoder (rooftop/address-range).
  ('ChIJmR_bwGZV2YAR13jvyWxggPA', 'Ryan Bros Coffee City Heights', 32.749533936225, -117.098339954359, 'food',
    jsonb_build_object('reviews', 146), now()),

  -- 7. Blackhawk Hardware and Garden Center, 4225 Park Rd, Charlotte, NC 28209
  --    US Census geocoder (rooftop/address-range).
  ('ChIJ31zKXVOeVogRYKJb06G_c7o', 'Blackhawk Hardware and Garden Center', 35.175809910061, -80.850964714404, 'shopping',
    jsonb_build_object('reviews', 1090), now()),

  -- 8. Splash Art, 78 Duke St, Liverpool L1 5AA, UK
  --    UK unit-postcode centroid for L1 5AA (crystalroof.co.uk) — a UK
  --    postcode unit is typically ~15 addresses, so this is near-rooftop.
  ('ChIJGbN0dcIhe0gRUXJQlOlTlew', 'Splash Art', 53.401617, -2.981927, 'attractions',
    jsonb_build_object('reviews', 246), now()),

  -- 9. Horror Vibes Coffee, 5251 Lankershim Blvd, North Hollywood, CA 91601
  --    US Census geocoder (rooftop/address-range).
  ('ChIJ6REWkQ2VwoARTSEKn3Yu6eM', 'Horror Vibes Coffee', 34.16607619138, -118.375424191219, 'food',
    jsonb_build_object('reviews', 471), now()),

  -- 10. Con Azucar Cafe, 13739 Foothill Blvd, Sylmar, CA 91342
  --     US Census geocoder (rooftop/address-range).
  ('ChIJ8UcgMK6PwoARgStBn3cH5n4', 'Con Azucar Cafe', 34.309206783242, -118.432464308869, 'food',
    jsonb_build_object('reviews', 122), now()),

  -- 11. Universal Studios Hollywood — SKIPPED. Already in wf_place_ids per
  --     the coordinator; ON CONFLICT DO NOTHING would have been a no-op
  --     anyway, left out entirely so this file only ever adds rows.

  -- 12. Disneyland Park, Anaheim, CA 92802
  --     latlong.net (public gazetteer entry for the park) — rooftop-level;
  --     the Census onelineaddress lookup for 1313 [S] Disneyland Dr did not
  --     resolve (private-drive address, not in TIGER).
  ('ChIJa147K9HX3IAR-lwiGIQv9i4', 'Disneyland Park', 33.812511, -117.918976, 'attractions',
    jsonb_build_object('reviews', 128263), now()),

  -- 13. Georgetown Drive-In, 8200 IN-64, Georgetown, IN 47122
  --     US Census geocoder (rooftop/address-range).
  ('ChIJYWbd5bFBaYgRO9b4WSc6ET8', 'Georgetown Drive-In', 38.295661643434, -85.960454050187, 'attractions',
    jsonb_build_object('reviews', 1514), now()),

  -- 14. The Bagel Nook, 4345 US-9, Freehold, NJ 07728
  --     Same gap as Brother Bruno's above: US Census TIGER has no
  --     address-range match for this stretch of US-9 (tried three address
  --     spellings), and every rooftop-precision non-Google geocoder tried
  --     was blocked or throttled. Coordinates below are the Freehold, NJ
  --     07728 town/ZIP centroid (findlatitudeandlongitude.com) — COARSER
  --     THAN ROOFTOP. Refine before this row feeds anything
  --     distance-sensitive.
  ('ChIJqwhQSDXTw4kRpobLnZNWJdI', 'The Bagel Nook', 40.260111, -74.273757, 'food',
    jsonb_build_object('reviews', 207), now()),

  -- Florida — left un-indexed at the end of WO5b, closed out here.
  -- Coordinates carried over from that session's own resolution (US Census
  -- geocoder for the two All Fired Up rows; the Nueva Cantina coordinate
  -- matches the one already written into lib/fallDiscoveries2026.js's
  -- nueva-cantina-halloween-tampa-2026 entry, itself sourced independently
  -- of Google in that same session).
  ('ChIJmzKZ8InEwogR0PM7xTqUB6M', 'Nueva Cantina - Downtown Tampa', 27.9517198, -82.4594849, 'food',
    jsonb_build_object('reviews', 1892), now()),
  ('ChIJjapVvA9w54gRY4Tpi19HXhI', 'All Fired Up (Winter Park) Pottery Painting', 28.593253, -81.352214, 'attractions',
    jsonb_build_object('reviews', 742), now()),
  ('ChIJhbni_xFn54gR0p89LazzSD8', 'All Fired Up (Waterford Lakes) Pottery Painting', 28.553835, -81.205856, 'attractions',
    jsonb_build_object('reviews', 102), now())

on conflict (place_id) do nothing;

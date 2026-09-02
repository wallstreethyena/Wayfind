-- scripts/data/nostalgia-archive-2026-09-02.sql
--
-- Work order 8 (2026-09-02) -- owner-supplied Florida nostalgia list, indexed
-- so the promotion drain can card them. Input:
-- /home/claude/work/nostalgia_places.csv (49 rows; Place Name, City, Address,
-- Google Place ID, Category, Source URL, Wayfind Action). The owner's own
-- spreadsheet matched every row to a current Google listing -- these Place IDs
-- are the owner's, not guessed here.
--
-- SKIPPED (18 of 49, queried live against wf_inventory + wf_place_ids, both by
-- place_id): 15 already resolved rows in wf_inventory (Lester's Diner, MAI-KAI,
-- Rustic Inn Crabhouse, Morro Castle, Le Tub, Sandy's Cafe, Keys Fisheries,
-- Versailles Restaurant, Beefy King, Hunt's Oyster Bar and Seafood, Bern's Steak
-- House, La Teresita Restaurant, Fred's Market Restaurant/Riverview, The Old
-- Salty Dog, Pipo's The Original Cuban Cafe) plus 3 already queued in
-- wf_place_ids awaiting promotion (The Whale's Rib, Fred's Market
-- Restaurant/Lakeland, Fred's Market Restaurant/Plant City) -- none of those 18
-- rows appear below; ON CONFLICT DO NOTHING would have no-op'd them anyway.
--
-- COORDINATES: geocoded via the US Census Bureau's public geocoder
-- (rooftop/address-range, Public_AR_Current benchmark), all-Florida. 30 of 31
-- rows matched on the first try (the address exactly as given). One row --
-- flagged below -- fell through Census's TIGER address-range data entirely
-- (also retried without a unit/suite and as street+city; still nothing) and
-- uses its West Miami city centroid instead. Per the work order, this is
-- expected and acceptable: the promotion drain's own Google Details call
-- replaces every coordinate at promotion time, so a centroid here only ever
-- has to be good enough to place the pin until that happens.
--
-- CATEGORY: 'food' for every diner/seafood/buffet/Cuban/cafeteria/steakhouse/
-- dinner-show row (30 of 31 -- the CSV's own Category column names a
-- restaurant subtype in every one of them, including the one row the CSV left
-- blank, Ocean Buffet, unambiguous from its name and source article).
-- 'attractions' for the one non-food row: MUSEUM OF ICE CREAM (CSV category
-- 'Dessert attraction' -- a ticketed museum experience, not a restaurant).
--
-- EDITORIAL: intentionally NOT written here. Every source below is an
-- everafterinthewoods.com nostalgia-archive article -- a real, specific,
-- venue-matched piece of writing, and a CANDIDATE source for a later
-- 'Featured in' editorial pass, not something to summarize into wf_inventory
-- sight unseen. That pass, if it happens, is separate work.
--
-- Applied by the parent via Supabase MCP. This file is not run by any script
-- or CI step in this repo -- ON CONFLICT DO NOTHING makes it safe to re-run.

insert into wf_place_ids (place_id, name, lat, lng, category, signals, seen_at) values
  -- 1. Seafood Atlantic, 520 Glen Cheek Dr, Cape Canaveral, FL 32920
  --    Source: https://everafterinthewoods.com/this-florida-retro-seafood-shack-road-trip-that-tastes-like-yesterday/
  ('ChIJATf9kjmm4IgR0h1Y4SE_pGU', 'Seafood Atlantic', 28.407888069772, -80.614173491408, 'food', '{}'::jsonb, now()),

  -- 2. Frenchy's Original Cafe, 41 Baymont St, Clearwater, FL 33767
  --    Source: https://everafterinthewoods.com/this-florida-retro-seafood-shack-road-trip-that-tastes-like-yesterday/ | https://everafterinthewoods.com/retro-florida-eateries-still-serving-like-its-the-eighties/
  ('ChIJeYs9itH2wogRrCzlbripy1w', 'Frenchy''s Original Cafe', 27.982080533435, -82.826656868451, 'food', '{}'::jsonb, now()),

  -- 3. Hibachi Grill and Supreme Buffet, 1320 W International Speedway Blvd, Daytona Beach, FL 32114
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJAyGOV0LZ5ogRhSFqEXPtWwc', 'Hibachi Grill and Supreme Buffet', 29.197608197147, -81.054463727197, 'food', '{}'::jsonb, now()),

  -- 4. Starlite Diner, 401 N Atlantic Ave, Daytona Beach, FL 32118
  --    Source: https://everafterinthewoods.com/this-florida-diner-with-vintage-wheels-serves-a-breakfast-worth-the-detour/
  ('ChIJ5b4haUDa5ogR8-bUuR0sVNQ', 'Starlite Diner', 29.220522095515, -81.004989882685, 'food', '{}'::jsonb, now()),

  -- 5. Ocean Buffet, 6795 W Newberry Rd, Gainesville, FL 32605
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJQ82WyJ686IgR9OyzSEUHPT8', 'Ocean Buffet', 29.659527123455, -82.414698527452, 'food', '{}'::jsonb, now()),

  -- 6. Piccadilly, 4500 Hollywood Blvd, Hollywood, FL 33021
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJI5NBaF-p2YgRYSGX5HLUw24', 'Piccadilly', 26.010334927786, -80.188525291258, 'food', '{}'::jsonb, now()),

  -- 7. 5 Brothers Key West - Coffee & Cubanos, 930 Southard St, Key West, FL 33040
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJkwUpI8G20YgRd8VLyYig4Xs', '5 Brothers Key West - Coffee & Cubanos', 24.558290393849, -81.796460082896, 'food', '{}'::jsonb, now()),

  -- 8. Boston Lobster Feast, 7702 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34747
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJYSXAqEZ_3YgRa-dZCkrYilI', 'Boston Lobster Feast', 28.337971552437, -81.594646430007, 'food', '{}'::jsonb, now()),

  -- 9. Ichiban Buffet, 5269 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34746
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJCaEjOeuB3YgRF4SiYt6B_mk', 'Ichiban Buffet', 28.333017484308, -81.494207213138, 'food', '{}'::jsonb, now()),

  -- 10. Ole Times Country Buffet, 2469 US-90, Lake City, FL 32055
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJA13JJ0o674gRS2ZyvXdpIIo', 'Ole Times Country Buffet', 30.179446678338, -82.671684402466, 'food', '{}'::jsonb, now()),

  -- 11. Arbetter's Hot Dogs, 8747 SW 40th St, Miami, FL 33165
  --    Source: https://everafterinthewoods.com/retro-florida-eateries-still-serving-like-its-the-eighties/
  ('ChIJce63wZC42YgR3TAt6cUx9Mw', 'Arbetter''s Hot Dogs', 25.733167553101, -80.336983912709, 'food', '{}'::jsonb, now()),

  -- 12. El Mago De Las Fritas, 5828 SW 8th St, Miami, FL 33144
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJ4Ujx1DK42YgRo50JGHlKJgE', 'El Mago De Las Fritas', 25.763424115027, -80.29068762509, 'food', '{}'::jsonb, now()),

  -- 13. Enriqueta's Sandwich Shop, 186 NE 29th St, Miami, FL 33137
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJy_djy1Sx2YgRPs0wErJi2Wg', 'Enriqueta''s Sandwich Shop', 25.803992451132, -80.19126560384, 'food', '{}'::jsonb, now()),

  -- 14. La Carreta, 3632 SW 8th St, Miami, FL 33135
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJTQraKAu32YgRbZxGo9tLB6E', 'La Carreta', 25.764676424384, -80.253751797712, 'food', '{}'::jsonb, now()),

  -- 15. MUSEUM OF ICE CREAM, 851 NE 1st Ave, Miami, FL 33132
  --    Source: https://everafterinthewoods.com/florida-s-all-you-can-eat-ice-cream-bar-is-the-sweetest-place-around-d9621a0b/
  ('ChIJWSqJMAC32YgRDJOfLiJr_ow', 'MUSEUM OF ICE CREAM', 25.782363854198, -80.192136751392, 'attractions', '{}'::jsonb, now()),

  -- 16. Mary's Cafe, 2542 SW 27th Ave, Miami, FL 33133
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJAQAAjJe22YgRei5EoaDknaU', 'Mary''s Cafe', 25.744377936592, -80.238061756774, 'food', '{}'::jsonb, now()),

  -- 17. China Lee Buffet, 3933 E Silver Springs Blvd, Ocala, FL 34470
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJb1DAYSct5ogRbUKmExPl_0o', 'China Lee Buffet', 29.201566083609, -82.080872151177, 'food', '{}'::jsonb, now()),

  -- 18. Boston Lobster Feast, 8731 International Dr, Orlando, FL 32819
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJPcTOak1-54gRzOWrFljfZxk', 'Boston Lobster Feast', 28.439365274447, -81.471152700323, 'food', '{}'::jsonb, now()),

  -- 19. Ichiban Buffet, 5529 International Dr, Orlando, FL 32819
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJb-VZ_O1-54gRnpheEnmq4lE', 'Ichiban Buffet', 28.462403703101, -81.454849123416, 'food', '{}'::jsonb, now()),

  -- 20. Super Orient Buffet, 4525 S Semoran Blvd, Orlando, FL 32822
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJK75bXppk54gRXks5-OP1Kqs', 'Super Orient Buffet', 28.498622966547, -81.310050460516, 'food', '{}'::jsonb, now()),

  -- 21. Super King Buffet, 3 W 9 Mile Rd #2, Pensacola, FL 32534
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJIzV8V7qVkIgR1ZyOrxZ9YI0', 'Super King Buffet', 30.53306105947, -87.273819072709, 'food', '{}'::jsonb, now()),

  -- 22. Peg Leg Pete's, 1010 Fort Pickens Rd, Pensacola Beach, FL 32561
  --    Source: https://everafterinthewoods.com/this-florida-retro-seafood-shack-road-trip-that-tastes-like-yesterday/
  ('ChIJcy4crj3GkIgRrtDw5yXIghQ', 'Peg Leg Pete''s', 30.327829189402, -87.163950089815, 'food', '{}'::jsonb, now()),

  -- 23. O'Steen's Restaurant, 205 Anastasia Blvd, St. Augustine, FL 32080
  --    Source: https://everafterinthewoods.com/this-florida-retro-seafood-shack-road-trip-that-tastes-like-yesterday/
  ('ChIJP6V72J4n5IgRT6qMuxWJpBs', 'O''Steen''s Restaurant', 29.891876534221, -81.301058035302, 'food', '{}'::jsonb, now()),

  -- 24. Buffet City, 1030 58th St N, St. Petersburg, FL 33710
  --    Source: https://everafterinthewoods.com/florida-buffets-that-still-feel-like-the-nineties-and-locals-love-them-for-it/
  ('ChIJBdJnDyjjwogRlMs--Pj_AY8', 'Buffet City', 27.782795177273, -82.712333791565, 'food', '{}'::jsonb, now()),

  -- 25. Ted Peters Famous Smoked Fish, 1350 Pasadena Ave S, St. Petersburg, FL 33707
  --    Source: https://everafterinthewoods.com/this-florida-retro-seafood-shack-road-trip-that-tastes-like-yesterday/ | https://everafterinthewoods.com/retro-florida-eateries-still-serving-like-its-the-eighties/
  ('ChIJWTRu9Er9wogRfeGYdm-Wdzo', 'Ted Peters Famous Smoked Fish', 27.756201458209, -82.737065242026, 'food', '{}'::jsonb, now()),

  -- 26. Dixie Crossroads, 1475 Garden St, Titusville, FL 32796
  --    Source: https://everafterinthewoods.com/this-florida-retro-seafood-shack-road-trip-that-tastes-like-yesterday/
  ('ChIJiYHNYshM54gRLfNszvkj_jo', 'Dixie Crossroads', 28.615311328694, -80.819999319949, 'food', '{}'::jsonb, now()),

  -- 27. Luis Galindo Latin America Restaurant, 898 Red Rd, West Miami, FL 33144
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  --    FLAGGED: US Census TIGER has no address-range match for '898 Red Rd, West Miami, FL 33144'
  --    (tried full address, without unit/suite, and street+city). Coordinates
  --    below are the West Miami, FL city centroid -- COARSER THAN ROOFTOP.
  --    The promotion drain's Details call replaces this at promotion.
  ('ChIJ_WhCqTK42YgRH-vW1wXuaJw', 'Luis Galindo Latin America Restaurant', 25.7617, -80.2986, 'food', '{}'::jsonb, now()),

  -- 28. Okeechobee Steak House, 2854 Okeechobee Blvd, West Palm Beach, FL 33409
  --    Source: https://everafterinthewoods.com/retro-florida-eateries-still-serving-like-its-the-eighties/
  ('ChIJU2CVp98p2YgRWRXwh16X8eM', 'Okeechobee Steak House', 26.7066484113, -80.099269481061, 'food', '{}'::jsonb, now()),

  -- 29. El Palacio de los Jugos, 5721 W Flagler St, Miami, FL 33144
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJY3jSPM652YgRsIyN6-vjA5k', 'El Palacio de los Jugos', 25.770833602012, -80.28851300802, 'food', '{}'::jsonb, now()),

  -- 30. El Rey De Las Fritas, 1821 SW 8th St, Miami, FL 33135
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJuYnp5vu22YgRqjNB5POHQPg', 'El Rey De Las Fritas', 25.765618567593, -80.225043423912, 'food', '{}'::jsonb, now()),

  -- 31. Islas Canarias Restaurant, 13695 SW 26th St, Miami, FL 33175
  --    Source: https://everafterinthewoods.com/vintage-florida-cafeterias-that-havent-changed-in-decades/
  ('ChIJjxXKu56_2YgRQbCl_QYXQyU', 'Islas Canarias Restaurant', 25.743627397315, -80.4161368469, 'food', '{}'::jsonb, now())

on conflict (place_id) do nothing;

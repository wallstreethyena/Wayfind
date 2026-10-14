# wf_inventory.metro: readers, simulation, plan (read only, origin/main, 2026-10-09)

Filters used everywhere below: status='OPERATIONAL' AND excluded IS NOT TRUE, lat/lng not null.
wf_inventory columns: place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,editorial,photo_ref,status,anchor,source,needs_review,last_verified_at,locked,seen_at,refreshed_at,editorial_card,cuisines,cuisine_confidence,cuisine_sources,cuisine_reason,cuisine_checked_at,cuisine_conf,excluded,exclusion_reason,secondary_categories.
NO city, county or region column. signals jsonb has address on 1 row only. Only index on metro: wf_inventory_cat_metro (metro, category).

## 1. Exact counts

(a) metro='tampa' AND wf_bucket_metro(lat,lng)='st-pete': **227** (228 if status is ignored, 1 non-operational). Excluded flag makes no difference (227 either way).
- by category: food 84 (48 carry cuisines), attractions 74, nightlife 41, shopping 14, hotels 12, beach 2 (Pass A Grille Dog Beach, St. Pete Beach Access).
- all 227 are within 30 mi of the Tampa landing centre (27.9506,-82.4572); 139 are within 17 mi; all 227 are within 17 mi of the St. Petersburg centre (27.7676,-82.6403). lng range -82.78..-82.60.
- 208 of 227 already have a wf_editorial row; 19 do not.
- Context: tampa total 2106 OPERATIONAL; st-pete already holds 698 (346 food).

(b) metro='manatee-sarasota' AND bucket='tampa': **11**
| name | category | lat,lng | actual place |
|---|---|---|---|
| Fort De Soto Beach | beach | 27.6427,-82.7426 | Pinellas (Tierra Verde / St. Pete) |
| Fort De Soto Boat Ramp | attractions | 27.6455,-82.7173 | Pinellas |
| Fort De Soto Park | attractions | 27.6338,-82.7186 | Pinellas |
| Fort De Soto Park Batteries And Military Post | attractions | 27.6155,-82.7359 | Pinellas |
| Fort De Soto Park Campground | attractions | 27.6343,-82.7186 | Pinellas |
| N Skyway Fishing Pier State Park | attractions | 27.6055,-82.6508 | Pinellas side |
| Sunshine Skyway Bridge | attractions | 27.6207,-82.6558 | spans Pinellas/Manatee |
| Camp Creek at North River Ranch | attractions | 27.6097,-82.4388 | Manatee County (Parrish) |
| Longmeadow Park at North River Ranch | attractions | 27.6101,-82.4445 | Manatee County |
| Wildleaf Park at North River Ranch | attractions | 27.6058,-82.4491 | Manatee County |
| Moody Branch Wildlife and Environmental Area | attractions | 27.6274,-82.2310 | Manatee County |
Place ids are in the DB (ChIJ...). Key finding: 4 of the 11 (North River Ranch x3, Moody Branch) are CORRECTLY manatee-sarasota. The bucket is wrong, not the label: the manatee-sarasota box (maxLat 27.62) and tampa box (minLat 27.60) overlap and wf_bucket_metro tie-breaks on nearest box centre, so the strip 27.60..27.62 goes to tampa. Only the 6 Pinellas rows (5 Fort De Soto + N Skyway pier) are true mislabels; Sunshine Skyway Bridge is a judgment call.
- Everglades National Park: metro='immokalee-fl', bucket='keys' (25.2866,-80.8987, Miami-Dade/Monroe, inside the keys box 24.5-25.3). 1 row. Correct region is "florida" or a south-Florida/Everglades label, not keys, not Immokalee.
- Related, not asked: 7 rows labeled 'tampa' bucket to 'florida' (Dunedin/Clearwater/Redington/Plant City edge, just outside the tampa box; fine as Tampa Bay). 70 'manatee-sarasota' rows and 53 'orlando' rows sit outside their box (bucket 'florida'); they are legit regional labels, box is just tight.

(c) legacy seed labels whose coordinates bucket only to 'florida': **529** (528 with bucket florida, +1 avon-park-fl row bucketing 'global').
By label (bucket=florida): st-augustine-fl 89, panama-city-florida 89, immokalee-fl 79, jacksonville-fl 76, ocala-fl 74, avon-park-fl 63, spring-hill-fl 47 (=517), georgia-usa 5, charlotte 3, pompano-beach-fl 1, boardman-or 1, city-37.3--85.4 1.
Geography (lat/lng ranges) shows the labels are loose: avon-park-fl spans 27.30..28.45 / -82.35..-80.63 (Highlands/Polk/Osceola belt); spring-hill-fl 27.98..28.58 / -82.83..-82.19 (Hernando/Pasco/Citrus); immokalee-fl 25.29..26.77 / -82.03..-80.32 (Collier/Lee/Everglades); ocala-fl 28.54..29.41; st-augustine-fl 29.23..30.40 (Volusia to Duval); panama-city-florida 29.69..30.81 / -86.6..-84.9 (Bay/Gulf/Franklin, Tallahassee edge); jacksonville-fl 30.14..30.62. Junk labels: boardman-or is a Volusia attraction (29.20,-81.04), city-37.3--85.4 is a St. Augustine area hotel, georgia-usa (30.44..31.06) includes rows near the GA line, charlotte = 3 nightlife rows around Port Charlotte (26.93..27.02, -82.2).
By county: **not possible from the DB** (no county column). Categories across the 517: food ~270, attractions ~170, nightlife ~110, a few beach/hotels.
Also 'keys' label 143 rows correctly bucket to keys (not part of c).
Dedupe risk on relabel: 1 row of (a) shares a lower-cased name with an existing st-pete row; 31 rows of (c) share a name with an existing 'florida' row (promoteIndex.js:313 dedupes on name+metro).

## 2. Every metro-label reader (origin/main)

Legend: LABEL = filters by wf_inventory.metro string; GEO = lat/lng or distance; both noted.

### Label readers (these change behavior if rows relabel)
1. **/eat/[metro] chips**: supabase wf_cuisine_chips(p_metro) body `i.metro = p_metro` (20260730_wf_cuisine_chips.sql:55, live fn confirmed). Page app/eat/[metro]/page.js:75-87 (chipsFor), valid keys = CUISINE_METROS (lib/cuisine.js:256-260: orlando, tampa (label "Tampa Bay"), manatee-sarasota). LABEL only, NO distance cap. 'st-pete' is not a key so /eat/st-pete 404s.
2. **/eat/[metro]/[cuisine]**: app/eat/[metro]/[cuisine]/page.js:177 -> wf_cuisine_places(p_metro,p_cuisine), `i.metro = p_metro` (live fn). LABEL only. generateStaticParams via lib/eatInventory.js:81-83.
3. wf_cuisine_coverage(p_metro) (20260730_wf_inventory_cuisine.sql:53) LABEL, admin/coverage only.
4. **/best-beaches/[metro]**: app/best-beaches/[metro]/page.js:54-83. wf_nearest_beaches RPC (live fn) = GEO (60 mi from CENTROID tampa 27.85,-82.6; p_max 40), THEN JS `.filter(b => b.metro === metro)` at :71 = LABEL. Keys: lib/beaches.js:14-18 BEACH_METROS (tampa label "Tampa Bay"), NEAR_LABEL :119.
5. **Trending/Exploding Nearby**: lib/explodingNearbyServe.js:64-70 explodingMetroFor maps Tampa/St Pete/Clearwater markets (marketForLocation within 60 mi) to 'tampa', Sarasota/Bradenton to 'manatee-sarasota'. Reads :255-262 `wf_inventory?...&metro=eq.${metro}&limit=600`. LABEL (user chosen by 60 mi GEO). Then matchTopicToInventory(..., {metro}) lib/trendMatch.js:116 rejects `place.metro !== metro` (WRONG_METRO).
6. **Native trend activity**: lib/trendSources/nativeEngine.js:131 + nativeCore.js:91 `allowedMetros.includes(p.metro)`; APPROVED_METROS = tampa, orlando, manatee-sarasota (lib/trendTaxonomy.js:875, enforced :899; scripts/trends-import.mjs:174). LABEL.
7. **Atlas editorial generation**: app/api/cron/atlas-build/route.js:147 `METROS=[tampa,orlando,manatee-sarasota]`, :510 RPCs wf_atlas_missing/stale/retryable with p_metros (`i.metro = any(p_metros)`, e.g. 20260923_wf_capture_live_function_state.sql:64), :532 REST `metro=in.(...)`. Also lib/atlasWebLane.js:11 METRO_CITY (tampa->Tampa, orlando, manatee-sarasota->Sarasota; :44,:139 verify city text; null for st-pete). scripts/atlas-batch.mjs:288 same scope. LABEL. NOTE: st-pete rows (698 today) are already NOT in atlas generation; 19 of the 227 have no editorial.
8. lib/socialAcquisition.js:32-40 INVENTORY_METROS ("Tampa Bay": [tampa, st-pete]; Jacksonville/Naples/Keys -> [florida]) :237-238 `.in("metro", metros)`. LABEL, already region-aware. Best existing pattern.
9. Photo-source queue trigger 20260927120325...sql:12-16, :143-147 fl_metros list incl. st-pete, florida and ALL legacy labels. LABEL. Relabeling inside this list is safe.
10. Metro as display/city text: lib/mapAreaData.js:99 `city: row.metro`, :111 governedScoreOf(p,row.metro); lib/groupPlanPlaceData.js:82 `city: row.metro`; app/api/summer/places/route.js:53. creatorSignals.js:40-43 cityMatches uses place.city + locName as haystack against creator entry city. Today 'tampa' matches creator entries with city "Tampa" for St. Pete places (false-positive); 'st-pete' normalizes to "st pete", does not match "St. Petersburg" either. No loss.
11. app/api/city/unlock/route.js:60-80 nearestExistingMetro: GEO box (0.35 deg ~24 mi) then tallies metro labels, picks any named metro with >=12 rows. Relabeling does not break it (st-pete already exists with 698).
12. Promotion: lib/promoteIndex.js bucketMetro :116 (GEO boxes), validateInventoryRow :224-228 (`w.metro !== metroKey` must equal run metro), dedupe :313; wf_enqueue_promotion trigger uses wf_bucket_metro. New places already get the nearest-box label (st-pete for St. Pete).
13. Tooling only: scripts/backfill-cuisine.mjs:53, seed-places.mjs:119, seed-anchors.mjs:134, report-editorial-coverage.mjs:48, photo-monitor.mjs:437 (groups by metro), backfill-photo-refs.mjs:82, trends-import.mjs:173.
14. lib/directSearch.js:231 bucketMetro for direct-search writes (GEO).

### Distance readers (label-free: unaffected by relabeling)
- **City landing pages (/things-to-do, /restaurants, /beaches, /nightlife, /culture bridge)**: lib/landing.js:491 rankedFor -> rankedForCenter -> lib/landingInventory.js:137 fetchLandingInventory -> serveFromInventory by lat/lng box: tight 27359 m (17.0 mi), widens to 48280 m (30 mi) only if <8 rows. Evergreen pairs (e.g. st-petersburg, lib/evergreenCities.js:43-46) additionally clamp to haversine 17 mi (lib/landing.js:138-143, EVERGREEN_RADIUS_MI). Tampa is in LANDING_CITIES (lib/landingCities.js:39), centre 27.9506,-82.4572. These never read the metro column. This is where "established distance limits on Tampa city pages" lives.
- lib/inventoryServe.js (home/browse feeds, box + 75 mi order-in radius lib/orderInFeatured.js:103), lib/ownedPool.js, lib/railSelect.js, hero-images cron CENTROIDS, mapArea viewport: all geometry.
- coupons/order-in: lib/orderInFeatured.js METROS (sarasota, stpete, tampa, orlando, miami) are delivery slugs with anchors, nearestMetro <=75 mi. Separate registry, not wf_inventory.metro.

## 3. Registries and "Tampa Bay"
- No single metro registry. Pieces: PROMOTE_METROS / table wf_promote_metros (bounds; includes st-pete 27.66-27.98, -82.79..-82.55 and tampa 27.60-28.17, -82.75..-82.20, overlapping, plus florida statewide 24.4-31.1/-87.7..-79.9, keys, miami-dade, broward, palm-beach, orlando, manatee-sarasota, global); CUISINE_METROS; BEACH_METROS; APPROVED_METROS; atlas METROS; METRO_CITY; INVENTORY_METROS; orderInFeatured.METROS; LANDING_CITIES/EVERGREEN_CITIES (st-petersburg landing exists, evergreenCities.js:46); destinations.js MARKETS.
- St. Pete: an st-pete DB label exists (698 rows) and a St. Petersburg evergreen city page exists. No /eat/st-pete, /best-beaches/st-pete, trending or atlas metro for it.
- "Tampa Bay" exists only as a LABEL: CUISINE_METROS.tampa.label, BEACH_METROS.tampa, NEAR_LABEL, eat page comment :108 ("Tampa Bay covers St. Pete and Clearwater"), socialAcquisition INVENTORY_METROS key. Metro key 'tampa' is therefore doing double duty as city key and Tampa Bay region key. That is the root conflation.

## 4. Simulation: relabel the 227 from tampa to st-pete

| reader | effect |
|---|---|
| /eat/tampa chips + /eat/tampa/[cuisine] | 84 food rows (48 with cuisines) disappear. Verified by SQL on wf_cuisine_chips logic: no chip drops below the floor (min after = turkish 3, was 4); counts fall e.g. breakfast 145->132, american 64->55, italian 49->42, seafood 79->74, greek 16->13. They do NOT appear anywhere else (no /eat/st-pete). Net: St. Pete restaurants vanish from the Tampa Bay eat pages. |
| /best-beaches/tampa | 2 beaches (Pass A Grille Dog Beach, St. Pete Beach Access) vanish (filter :71); no st-pete page. (b) Fort De Soto Beach currently shows on /best-beaches/manatee-sarasota (17 mi from its centroid); relabel to st-pete drops it from there and shows nowhere; relabel to tampa moves it to Tampa Bay beaches. |
| Trending Nearby (Tampa, St. Pete, Clearwater users) | rows read with metro=eq.tampa; all 227 vanish for those users (not read for st-pete). Parrish/Sarasota users currently see the 6 Pinellas (b) rows as manatee-sarasota. |
| Native trend activity / trendMatch | 227 rows become WRONG_METRO / excluded from allowedMetros. |
| Atlas editorial | 227 leave the generation scope; the 19 without editorial never get generated (already true for all 698 st-pete rows). |
| /things-to-do, /restaurants, /nightlife, /beaches city landing pages (Tampa, St. Petersburg) | NO change. Geometry only: the 139 within 17 mi and the 227 within 30 mi of Tampa centre follow the existing caps regardless of label; all 227 already qualify for St. Petersburg (17 mi). |
| socialAcquisition (Tampa Bay) | No change (reads tampa + st-pete). |
| Photo trigger / queue | No change (st-pete is in fl_metros). |
| map viewport, group plan | city text changes from "tampa" to "st-pete"; creator city match neutral. |
Conclusion: a bare data relabel would silently remove up to 227 St. Pete places from Tampa Bay /eat, beaches, Trending Nearby and trends, so the reader changes must ship first.

## 5. Minimal plan

Principle: label = accurate place; coverage = a named region that lists member labels.

Step 0 (code, ship first, no data change; verified by tests):
1. Add lib/metroRegions.js (pure): `REGIONS = { "tampa-bay": { label: "Tampa Bay", members: ["tampa","st-pete"], centre: {27.9506,-82.4572}, capMi: 30 } }` and `membersOf(key)`. Add a prebuild guard that every member is in PROMOTE_METROS and every reader that takes a metro goes through membersOf.
2. SQL migration: `wf_region_members(text) returns text[]` ('tampa' -> {tampa,st-pete}, else {p}); change wf_cuisine_chips / wf_cuisine_places / wf_cuisine_coverage to `i.metro = any(wf_region_members(p_metro))` (keeps /eat/tampa titled "Tampa Bay"; page already says it covers St. Pete and Clearwater). Optional distance cap in the function: `and haversine(i, tampa centre) <= 30` to meet "must not bypass distance limits" (all 227 pass at 30 mi; 17 mi would drop 88).
3. best-beaches page :71 -> `membersOf(metro).includes(b.metro)` (already 60 mi cap from SQL).
4. explodingNearbyServe :255-262 -> `metro=in.(...)` using membersOf; trendMatch.js:116 compare against membersOf; APPROVED_METROS gets 'st-pete' (or region-aware check) in trendTaxonomy.js:875, nativeCore.js:91.
5. atlas-build METROS add 'st-pete' (:147) and METRO_CITY 'st-pete': "St. Petersburg" (atlasWebLane.js:11); atlas-batch METRO_LABEL.
6. Leave landing pages alone (already geometry-only with 17/30 mi caps).
Add a lock test that renders each reader with a st-pete fixture row and asserts it still appears on the Tampa Bay surface.

Step 1 (data, after Step 0 deploys and is verified live on gowayfind.com):
- (a) update the 227 rows to metro='st-pete' (single UPDATE with WHERE metro='tampa' AND wf_bucket_metro(lat,lng)='st-pete', status/excluded unchanged; resolve the 1 name collision first). Expected: Tampa Bay /eat counts unchanged, Tampa-only city pages unchanged.
- (b) relabel only the 5 Fort De Soto rows + N Skyway Fishing Pier to 'st-pete'; keep North River Ranch x3 and Moody Branch as manatee-sarasota (correct; fix wf_bucket_metro/PROMOTE_METROS overlap by trimming manatee-sarasota maxLat or tiebreak so twin fn and bucketMetro stay in parity, scripts/check-promote-metros-parity.mjs); Sunshine Skyway Bridge needs owner call (st-pete). Fort De Soto then leaves /best-beaches/manatee-sarasota (correct, it is Pinellas) and appears on Tampa Bay beaches via the region. Everglades NP: set to 'florida'.
- (c) accurate broader value: **'florida'**. It is an existing active wf_promote_metros box, the value wf_bucket_metro already returns for all 528, and socialAcquisition already maps Jacksonville/Naples/Keys regions to ['florida']. No sub-state region or county list exists in code or DB, so do NOT invent st-augustine-style labels as truth. Effects: no runtime page reads the legacy labels (only photo trigger fl_metros, which contains florida), so no page coverage is lost; socialAcquisition for Jacksonville/Naples/Keys would GAIN these rows. Handle the 31 name collisions with existing 'florida' rows first (promoteIndex.js:313 dedupe key), and review the junk labels (georgia-usa near GA line, boardman-or, city-37.3--85.4) individually. If the owner wants city/county identity kept, add nullable columns city, county, region to wf_inventory (new migration, RLS unchanged) and backfill from the free Census geocoder path already in lib/atlasWebLane.js (geocodeCensus), never Google; then labels and discovery stay separate by construction. Preserve the old value in a column such as legacy_metro before updating so it can be rolled back.

Sequence per CLAUDE.md: one PR per step off fresh origin/main, prebuild green, owner merge, verify on live site. This report did not change anything.

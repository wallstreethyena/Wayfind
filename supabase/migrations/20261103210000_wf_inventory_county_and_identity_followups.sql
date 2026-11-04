-- PENDING APPLY. Declared in scripts/migration-pending-apply.json.
-- Lane claude.exe follow-ups to #2128/#2129 (owner-approved data-integrity handoff, 2026-11-03).
-- Reverse: supabase/data-fixes/20261103210000_wf_inventory_county_and_identity_followups_REVERSE.sql
--
-- Contract (lib/placeIdentity.js): locality, county = where the place actually is
-- (the US Census place and county containing the row's own point; county is the
-- bare Census BASENAME).
--
-- 1. COUNTY for the 82 rows #2128 gave a locality (ledger 20261103124728). The Census
--    county of each row's point is in
--    docs/audits/20261031000000_wf_inventory_locality_from_owned_events.census.json
--    (queried 2026-11-03T11:49Z). Re-read 2026-11-03 ~21Z: all 82 points unchanged,
--    county still empty, exactly one county each. Each update also requires the
--    locality #2128 wrote and the exact point the Census lookup used.
--    NOT the 10 conflicting rows: under this contract county set with locality
--    empty means "in no Census place", which is false for them. They stay
--    untouched until the owner decides the mailing-city question.
-- 2. Holmes Beach, the beach card ChIJaWeoBbURw4gRDYfwKuwOVW0: locality and county empty;
--    Census 2026-11-03 for its point: Holmes Beach (incorporated) / Manatee.
-- 3. Sir Henry's Haunted Trail ChIJeZM_F1A23YgRFICuRhA_pIo: metro 'tampa-bay' is a key no reader
--    knows (lib/metroRegions.js reads tampa + st-pete), so the row is on no Tampa Bay
--    surface. Census: Plant City / Hillsborough; Hillsborough rows are 'tampa'.
--    Only metro changes.
-- No name, address, coordinate, status or Google content is written.
-- ALL OR NOTHING: the closing assertion re-reads every named row; any skip rolls back.

begin;

update public.wf_inventory set county = 'Seminole'
 where place_id = 'ChIJaRU86ORx54gRK3zyCcF94hw' and county is null and locality = 'Altamonte Springs'
   and lat::numeric = 28.6629642 and lng::numeric = -81.3472715;  -- A Petrified Forest Scare Trail
update public.wf_inventory set county = 'Manatee'
 where place_id = 'ChIJ550owHsXw4gR4L8ZcLVqA-M' and county is null and locality = 'Bradenton'
   and lat::numeric = 27.4820457 and lng::numeric = -82.5756602;  -- Flamingo Bay Brewing
update public.wf_inventory set county = 'Manatee'
 where place_id = 'ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ' and county is null and locality = 'Bradenton'
   and lat::numeric = 27.49658 and lng::numeric = -82.573468;  -- Bradenton Public Market
update public.wf_inventory set county = 'Manatee'
 where place_id = 'ChIJaWJirJcWw4gRboJr7F108HM' and county is null and locality = 'Bradenton'
   and lat::numeric = 27.4629264 and lng::numeric = -82.6243342;  -- Clancy's Irish Sports Pub & Grill
update public.wf_inventory set county = 'Manatee'
 where place_id = 'ChIJB-QyVtEXw4gRk5F8bn3YV28' and county is null and locality = 'Bradenton'
   and lat::numeric = 27.4977283 and lng::numeric = -82.5680353;  -- Manatee Performing Arts Center
update public.wf_inventory set county = 'Manatee'
 where place_id = 'ChIJhW6JF_MWw4gRUxIRevnpN4k' and county is null and locality = 'Bradenton'
   and lat::numeric = 27.47364 and lng::numeric = -82.6165159;  -- G.T. Bray Park
update public.wf_inventory set county = 'Manatee'
 where place_id = 'ChIJy76z4HY9w4gROaX_C6lQu8g' and county is null and locality = 'Bradenton'
   and lat::numeric = 27.4949466 and lng::numeric = -82.5481567;  -- Manatee Village Historical Park
update public.wf_inventory set county = 'Pinellas'
 where place_id = 'ChIJiZrtZSvxwogRE9eu4Xpy9Yc' and county is null and locality = 'Clearwater'
   and lat::numeric = 27.9769348 and lng::numeric = -82.8176984;  -- Clearwater Marine Aquarium
update public.wf_inventory set county = 'Brevard'
 where place_id = 'ChIJ40ShwrcB3ogR38px18fDfss' and county is null and locality = 'Cocoa'
   and lat::numeric = 28.3503666 and lng::numeric = -80.7272064;  -- River Road Coffee and Popsicles
update public.wf_inventory set county = 'Miami-Dade'
 where place_id = 'ChIJu_e4BnTI2YgREAOg3GxMK8g' and county is null and locality = 'Coral Gables'
   and lat::numeric = 25.6767893 and lng::numeric = -80.2720386;  -- Fairchild Tropical Botanic Garden
update public.wf_inventory set county = 'Okaloosa'
 where place_id = 'ChIJqQ1Avv5DkYgR19YWeQV8UiQ' and county is null and locality = 'Destin'
   and lat::numeric = 30.3940594 and lng::numeric = -86.5121123;  -- HarborWalk Village
update public.wf_inventory set county = 'Pinellas'
 where place_id = 'ChIJZSzeKLDzwogRSwm6alxyabw' and county is null and locality = 'Dunedin'
   and lat::numeric = 28.0499673 and lng::numeric = -82.7827675;  -- Frenchy's Stone Crab and Seafood Market
update public.wf_inventory set county = 'Broward'
 where place_id = 'ChIJFzRAfooB2YgRtuvhmGrE7RY' and county is null and locality = 'Fort Lauderdale'
   and lat::numeric = 26.1191782 and lng::numeric = -80.1442069;  -- The Wharf Fort Lauderdale
update public.wf_inventory set county = 'Lee'
 where place_id = 'ChIJ96iz9wdq24gRftTmyqbwI64' and county is null and locality = 'Fort Myers'
   and lat::numeric = 26.6469699 and lng::numeric = -81.8658887;  -- Burroughs Home and Gardens
update public.wf_inventory set county = 'Lee'
 where place_id = 'ChIJVVUNg8JB24gRo5VjblNO_c8' and county is null and locality = 'Fort Myers'
   and lat::numeric = 26.6342787 and lng::numeric = -81.879512;  -- Edison & Ford Winter Estates
update public.wf_inventory set county = 'St. Lucie'
 where place_id = 'ChIJX0UJnszx3ogRKqv856yKO_s' and county is null and locality = 'Fort Pierce'
   and lat::numeric = 27.418487 and lng::numeric = -80.323597;  -- Heathcote Botanical Gardens
update public.wf_inventory set county = 'Duval'
 where place_id = 'ChIJYWfOURm35YgRZ6p-Om4KBNM' and county is null and locality = 'Jacksonville'
   and lat::numeric = 30.3253772 and lng::numeric = -81.6533019;  -- Element Bistro Bar and Lounge
update public.wf_inventory set county = 'Martin'
 where place_id = 'ChIJWTX7kWvn3ogRRjQhNzC11RQ' and county is null and locality = 'Jensen Beach'
   and lat::numeric = 27.2255462 and lng::numeric = -80.2124299;  -- Children's Museum of the Treasure Coast
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJDVFcVYZ_3YgRU4PZ5Fw44Ek' and county is null and locality = 'Lake Buena Vista'
   and lat::numeric = 28.3708582 and lng::numeric = -81.5187349;  -- The Edison
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJJ4xUsMiB3YgRtioaCI7zFlY' and county is null and locality = 'Lake Buena Vista'
   and lat::numeric = 28.3706546 and lng::numeric = -81.5171895;  -- Frontera Cocina
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJk5xl2oZ_3YgRg7yR_vn87h4' and county is null and locality = 'Lake Buena Vista'
   and lat::numeric = 28.3704659 and lng::numeric = -81.5181848;  -- Chef Art Smith's Homecomin'
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJOcKapod_3YgR90H_S_UKiMA' and county is null and locality = 'Lake Buena Vista'
   and lat::numeric = 28.3710834 and lng::numeric = -81.5177549;  -- Raglan Road Irish Pub
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJXSjMOWd_3YgR7IaYUVKFrms' and county is null and locality = 'Lake Buena Vista'
   and lat::numeric = 28.36986 and lng::numeric = -81.5212163;  -- Everglazed Donuts & Cold Brew
update public.wf_inventory set county = 'Polk'
 where place_id = 'ChIJ1dJMdEc43YgRmII076Tbhmg' and county is null and locality = 'Lakeland'
   and lat::numeric = 28.0359248 and lng::numeric = -82.0148508;  -- Silver Moon Drive-In Theatre
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJ-WLCqkdw54gR5FyZzXYSoV4' and county is null and locality = 'Maitland'
   and lat::numeric = 28.6164719 and lng::numeric = -81.3644008;  -- Enzian Theater
update public.wf_inventory set county = 'Miami-Dade'
 where place_id = 'ChIJBVShAmez2YgRvNWv6nIzzzY' and county is null and locality = 'Miami Beach'
   and lat::numeric = 25.8073663 and lng::numeric = -80.1234789;  -- Faena Miami Beach
update public.wf_inventory set county = 'Miami-Dade'
 where place_id = 'ChIJI-aAsE-32YgRlQrq8LqdUa8' and county is null and locality = 'Miami'
   and lat::numeric = 25.7849637 and lng::numeric = -80.193414;  -- Giselle Miami
update public.wf_inventory set county = 'Miami-Dade'
 where place_id = 'ChIJK69z3qO22YgROBJC2vDIXAI' and county is null and locality = 'Miami'
   and lat::numeric = 25.7846546 and lng::numeric = -80.1931826;  -- CLUB SPACE
update public.wf_inventory set county = 'Miami-Dade'
 where place_id = 'ChIJo83NFCqx2YgRXsS12ziKrO8' and county is null and locality = 'Miami'
   and lat::numeric = 25.8092309 and lng::numeric = -80.1954326;  -- The Sylvester
update public.wf_inventory set county = 'Miami-Dade'
 where place_id = 'ChIJoVWX_Rm02YgRllHsIZGN16c' and county is null and locality = 'Miami'
   and lat::numeric = 25.7846994 and lng::numeric = -80.1765206;  -- Miami Children's Museum
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJnU1-CO1554gRuvTm3EZVA9Y' and county is null and locality = 'Ocoee'
   and lat::numeric = 28.5528775 and lng::numeric = -81.50843;  -- Rock 'N Rev Ocoee
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJ231qjvF754gRZX6vzhb2aCk' and county is null and locality = 'Orlando'
   and lat::numeric = 28.570347 and lng::numeric = -81.403904;  -- Great Southern Box Company
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJ7aIAgJd654gRjUN8WsPaaI4' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5727501 and lng::numeric = -81.3651199;  -- Orlando Museum of Art
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJaybvA3N754gRTQX-9RlrMko' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5410939 and lng::numeric = -81.3791638;  -- Euphoria Downtown
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJb2Fn68t554gRrVzqlpOn-hk' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5572538 and lng::numeric = -81.4378601;  -- Orlando Amphitheater
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJbbY73up654gRsbf2dTWiCas' and county is null and locality = 'Orlando'
   and lat::numeric = 28.559887 and lng::numeric = -81.3646031;  -- Will's Pub
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJbVPT1f1654gRJvFabQEhowU' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5414161 and lng::numeric = -81.378281;  -- Bullitt Bar
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJcQyYH85654gRPh6gV_UpsDY' and county is null and locality = 'Orlando'
   and lat::numeric = 28.546919 and lng::numeric = -81.3467079;  -- Festival Park
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJEwDtLpl754gR0qE-zUCv6PQ' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5639032 and lng::numeric = -81.3655368;  -- Grape and the Grain Wine Bar
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJHWBuq9p654gR5Pz28aJykCc' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5486774 and lng::numeric = -81.3513424;  -- The Plaza Live
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJMfdMl_5654gRpZP9kPXrotU' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5429997 and lng::numeric = -81.3791995;  -- The Beacham
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJncyg0v1654gRzcygkvMIsg0' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5417473 and lng::numeric = -81.3775546;  -- Celine Orlando
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJo2bql5B654gR_ITN9PGhBbU' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5722626 and lng::numeric = -81.3682645;  -- Orlando Science Center
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJOZ6tqU5754gRmHz-pzzl33s' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5611373 and lng::numeric = -81.3642795;  -- Zymarium Meadery
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJOzDmBvJ-54gR6XhJQHPs5KI' and county is null and locality = 'Orlando'
   and lat::numeric = 28.463328 and lng::numeric = -81.4549927;  -- Rum Jungle
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJqxgi_-J654gRAUVO-nnoTgA' and county is null and locality = 'Orlando'
   and lat::numeric = 28.541117 and lng::numeric = -81.37052;  -- The Abbey
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJuQTH2xd754gRUV-O6arVOhQ' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5434771 and lng::numeric = -81.3671587;  -- The Final Whistle at Thornton Park Pub
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJVcr7Ufp654gRkJGTJZILyfc' and county is null and locality = 'Orlando'
   and lat::numeric = 28.5392214 and lng::numeric = -81.3838535;  -- Kia Center
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJz-NtNPx654gR5pilGxE8KDo' and county is null and locality = 'Orlando'
   and lat::numeric = 28.541985 and lng::numeric = -81.377314;  -- Stagger Inn
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJNwQxUnFDw4gRlEruVgcCmu0' and county is null and locality = 'Osprey'
   and lat::numeric = 27.2020561 and lng::numeric = -82.4912326;  -- Historic Spanish Point
update public.wf_inventory set county = 'Bay'
 where place_id = 'ChIJHdRIEU2Mk4gRfAM5vKPoRxk' and county is null and locality = 'Panama City Beach'
   and lat::numeric = 30.2297876 and lng::numeric = -85.8771235;  -- Frank Brown Park
update public.wf_inventory set county = 'Escambia'
 where place_id = 'ChIJheIoirLAkIgRPxCpsjJZlYs' and county is null and locality = 'Pensacola'
   and lat::numeric = 30.4086551 and lng::numeric = -87.2110678;  -- Historic Pensacola Village
update public.wf_inventory set county = 'Escambia'
 where place_id = 'ChIJs79B6VTHkIgR_GrMBD-pkJk' and county is null and locality = 'Pensacola'
   and lat::numeric = 30.4031273 and lng::numeric = -87.2186654;  -- Vince J. Whibbs Sr. Community Maritime Park
update public.wf_inventory set county = 'Seminole'
 where place_id = 'ChIJ8QTtKHMT54gR_ucFCO6b4RE' and county is null and locality = 'Sanford'
   and lat::numeric = 28.8013811 and lng::numeric = -81.2734823;  -- The Barn in Sanford
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJ1YBgZHRAw4gRorfVkB1B6bY' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3451865 and lng::numeric = -82.5371214;  -- The Sarasota Children's Garden
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJ3VLBF5Jqw4gRkT1TfU3ULd8' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3183915 and lng::numeric = -82.5772805;  -- St. Armands Circle
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJ6_YRRRJAw4gRE5XF42pZOxo' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3370057 and lng::numeric = -82.5435728;  -- Sarasota Opera House
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJ62qtuiVBw4gRFdwvl9Z4X_Y' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3365922 and lng::numeric = -82.5448872;  -- Perspective Rooftop Pool Bar
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJ6y2dx9g_w4gRWoZIRhLk-JI' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3815477 and lng::numeric = -82.5605716;  -- The John and Mable Ringling Museum of Art
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJB_VL5xJAw4gRY58y23x1wBw' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3363361 and lng::numeric = -82.5416222;  -- Joe's On Main
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJew4bcA9Aw4gR3bU-SA7qAgU' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3427563 and lng::numeric = -82.5504342;  -- Van Wezel Performing Arts Hall
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJhRwCTPZAw4gROrb2GkpgkGQ' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3189456 and lng::numeric = -82.5171243;  -- Arlington Park Sarasota
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJLZ2vzRxBw4gRMOtW0ArhBhw' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3416398 and lng::numeric = -82.548793;  -- The Bay Park
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJPWsUhY9Aw4gRoltOtGa3nPM' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3362524 and lng::numeric = -82.5102537;  -- Sarasota Fairgrounds
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJq6rO_XtAw4gRV_KGbfGfJ4g' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3435333 and lng::numeric = -82.5247609;  -- The Bazaar on Apricot & Lime Indie Market
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJtcnZQU9Bw4gROmYnVLnl0hE' and county is null and locality = 'Sarasota'
   and lat::numeric = 27.3370954 and lng::numeric = -82.54617;  -- Sage Restaurant
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJK1nJH9xrw4gRIr9IhuzYVQI' and county is null and locality = 'Siesta Key'
   and lat::numeric = 27.2759675 and lng::numeric = -82.5648518;  -- Siesta Key Village
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJSZdWvAlqw4gRo53EHrAL5gU' and county is null and locality = 'Siesta Key'
   and lat::numeric = 27.2740558 and lng::numeric = -82.5639096;  -- The Blasé Martini Bar & 3.14 Pi Pizza
update public.wf_inventory set county = 'St. Johns'
 where place_id = 'ChIJ0UaxcHon5IgRtIDfdNZ5UsQ' and county is null and locality = 'St. Augustine'
   and lat::numeric = 29.8818461 and lng::numeric = -81.2885721;  -- St. Augustine Alligator Farm Zoological Park
update public.wf_inventory set county = 'St. Johns'
 where place_id = 'ChIJvwS00mgn5IgRdR5IlMxNUp0' and county is null and locality = 'St. Augustine'
   and lat::numeric = 29.8732423 and lng::numeric = -81.2763785;  -- Anastasia State Park
update public.wf_inventory set county = 'Leon'
 where place_id = 'ChIJn2JUR3Bf7IgRDoeGio3YFuE' and county is null and locality = 'Tallahassee'
   and lat::numeric = 30.4564375 and lng::numeric = -84.2579489;  -- Goodwood Museum & Gardens
update public.wf_inventory set county = 'Leon'
 where place_id = 'ChIJT8lyCbL07IgR7bBS2PG4XQI' and county is null and locality = 'Tallahassee'
   and lat::numeric = 30.4104779 and lng::numeric = -84.3440395;  -- Tallahassee Museum
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJg1HuP9xbw4gRs9PHCFmC4VU' and county is null and locality = 'Venice'
   and lat::numeric = 27.0711111 and lng::numeric = -82.4480556;  -- Maxine Barritt Park
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJHYWhzLpbw4gR-dyWVALZtfw' and county is null and locality = 'Venice'
   and lat::numeric = 27.0996748 and lng::numeric = -82.4444279;  -- Historic Downtown Venice, FL
update public.wf_inventory set county = 'Sarasota'
 where place_id = 'ChIJu73by6Rbw4gR857K3YRfLQo' and county is null and locality = 'Venice'
   and lat::numeric = 27.1006258 and lng::numeric = -82.4468937;  -- Centennial Park
update public.wf_inventory set county = 'Palm Beach'
 where place_id = 'ChIJB_x-d4nW2IgRA8KT7MrGCis' and county is null and locality = 'West Palm Beach'
   and lat::numeric = 26.7126502 and lng::numeric = -80.0506057;  -- Camelot
update public.wf_inventory set county = 'Palm Beach'
 where place_id = 'ChIJLd_uxonW2IgRCHBSV77RI9E' and county is null and locality = 'West Palm Beach'
   and lat::numeric = 26.7134191 and lng::numeric = -80.0523365;  -- Roxy's Pub
update public.wf_inventory set county = 'Palm Beach'
 where place_id = 'ChIJV8mRgbbX2IgRloAsUHzNI6s' and county is null and locality = 'West Palm Beach'
   and lat::numeric = 26.7069251 and lng::numeric = -80.0531973;  -- Treehouse
update public.wf_inventory set county = 'Polk'
 where place_id = 'ChIJ38rlfogN3YgRGic46M9dbLw' and county is null and locality = 'Winter Haven'
   and lat::numeric = 27.9898932 and lng::numeric = -81.6914153;  -- LEGOLAND® Florida Resort
update public.wf_inventory set county = 'Polk'
 where place_id = 'ChIJu5o2QZAN3YgRMruJ3jk1KG8' and county is null and locality = 'Winter Haven'
   and lat::numeric = 27.9871781 and lng::numeric = -81.6890063;  -- PEPPA PIG Theme Park Florida
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJDahUeGJ654gRTbXyn3JDd0U' and county is null and locality = 'Winter Park'
   and lat::numeric = 28.587212 and lng::numeric = -81.3627143;  -- The Courtesy
update public.wf_inventory set county = 'Orange'
 where place_id = 'ChIJeYMYltVx54gRB4G-KKYiD8I' and county is null and locality = 'Winter Park'
   and lat::numeric = 28.5924285 and lng::numeric = -81.3585927;  -- Forward Slash Distillery & Blending House

update public.wf_inventory set locality = 'Holmes Beach', county = 'Manatee'
 where place_id = 'ChIJaWeoBbURw4gRDYfwKuwOVW0' and primary_type = 'beach'
   and locality is null and county is null
   and lat::numeric = 27.4967899 and lng::numeric = -82.7112241;

update public.wf_inventory set metro = 'tampa'
 where place_id = 'ChIJeZM_F1A23YgRFICuRhA_pIo' and metro = 'tampa-bay'
   and county = 'Hillsborough' and locality = 'Plant City';

do $$
declare wrong integer;
begin
  select count(*) into wrong
  from (values
    ('ChIJaRU86ORx54gRK3zyCcF94hw', 'Altamonte Springs', 'Seminole', null::text),
    ('ChIJ550owHsXw4gR4L8ZcLVqA-M', 'Bradenton', 'Manatee', null::text),
    ('ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ', 'Bradenton', 'Manatee', null::text),
    ('ChIJaWJirJcWw4gRboJr7F108HM', 'Bradenton', 'Manatee', null::text),
    ('ChIJB-QyVtEXw4gRk5F8bn3YV28', 'Bradenton', 'Manatee', null::text),
    ('ChIJhW6JF_MWw4gRUxIRevnpN4k', 'Bradenton', 'Manatee', null::text),
    ('ChIJy76z4HY9w4gROaX_C6lQu8g', 'Bradenton', 'Manatee', null::text),
    ('ChIJiZrtZSvxwogRE9eu4Xpy9Yc', 'Clearwater', 'Pinellas', null::text),
    ('ChIJ40ShwrcB3ogR38px18fDfss', 'Cocoa', 'Brevard', null::text),
    ('ChIJu_e4BnTI2YgREAOg3GxMK8g', 'Coral Gables', 'Miami-Dade', null::text),
    ('ChIJqQ1Avv5DkYgR19YWeQV8UiQ', 'Destin', 'Okaloosa', null::text),
    ('ChIJZSzeKLDzwogRSwm6alxyabw', 'Dunedin', 'Pinellas', null::text),
    ('ChIJFzRAfooB2YgRtuvhmGrE7RY', 'Fort Lauderdale', 'Broward', null::text),
    ('ChIJ96iz9wdq24gRftTmyqbwI64', 'Fort Myers', 'Lee', null::text),
    ('ChIJVVUNg8JB24gRo5VjblNO_c8', 'Fort Myers', 'Lee', null::text),
    ('ChIJX0UJnszx3ogRKqv856yKO_s', 'Fort Pierce', 'St. Lucie', null::text),
    ('ChIJYWfOURm35YgRZ6p-Om4KBNM', 'Jacksonville', 'Duval', null::text),
    ('ChIJWTX7kWvn3ogRRjQhNzC11RQ', 'Jensen Beach', 'Martin', null::text),
    ('ChIJDVFcVYZ_3YgRU4PZ5Fw44Ek', 'Lake Buena Vista', 'Orange', null::text),
    ('ChIJJ4xUsMiB3YgRtioaCI7zFlY', 'Lake Buena Vista', 'Orange', null::text),
    ('ChIJk5xl2oZ_3YgRg7yR_vn87h4', 'Lake Buena Vista', 'Orange', null::text),
    ('ChIJOcKapod_3YgR90H_S_UKiMA', 'Lake Buena Vista', 'Orange', null::text),
    ('ChIJXSjMOWd_3YgR7IaYUVKFrms', 'Lake Buena Vista', 'Orange', null::text),
    ('ChIJ1dJMdEc43YgRmII076Tbhmg', 'Lakeland', 'Polk', null::text),
    ('ChIJ-WLCqkdw54gR5FyZzXYSoV4', 'Maitland', 'Orange', null::text),
    ('ChIJBVShAmez2YgRvNWv6nIzzzY', 'Miami Beach', 'Miami-Dade', null::text),
    ('ChIJI-aAsE-32YgRlQrq8LqdUa8', 'Miami', 'Miami-Dade', null::text),
    ('ChIJK69z3qO22YgROBJC2vDIXAI', 'Miami', 'Miami-Dade', null::text),
    ('ChIJo83NFCqx2YgRXsS12ziKrO8', 'Miami', 'Miami-Dade', null::text),
    ('ChIJoVWX_Rm02YgRllHsIZGN16c', 'Miami', 'Miami-Dade', null::text),
    ('ChIJnU1-CO1554gRuvTm3EZVA9Y', 'Ocoee', 'Orange', null::text),
    ('ChIJ231qjvF754gRZX6vzhb2aCk', 'Orlando', 'Orange', null::text),
    ('ChIJ7aIAgJd654gRjUN8WsPaaI4', 'Orlando', 'Orange', null::text),
    ('ChIJaybvA3N754gRTQX-9RlrMko', 'Orlando', 'Orange', null::text),
    ('ChIJb2Fn68t554gRrVzqlpOn-hk', 'Orlando', 'Orange', null::text),
    ('ChIJbbY73up654gRsbf2dTWiCas', 'Orlando', 'Orange', null::text),
    ('ChIJbVPT1f1654gRJvFabQEhowU', 'Orlando', 'Orange', null::text),
    ('ChIJcQyYH85654gRPh6gV_UpsDY', 'Orlando', 'Orange', null::text),
    ('ChIJEwDtLpl754gR0qE-zUCv6PQ', 'Orlando', 'Orange', null::text),
    ('ChIJHWBuq9p654gR5Pz28aJykCc', 'Orlando', 'Orange', null::text),
    ('ChIJMfdMl_5654gRpZP9kPXrotU', 'Orlando', 'Orange', null::text),
    ('ChIJncyg0v1654gRzcygkvMIsg0', 'Orlando', 'Orange', null::text),
    ('ChIJo2bql5B654gR_ITN9PGhBbU', 'Orlando', 'Orange', null::text),
    ('ChIJOZ6tqU5754gRmHz-pzzl33s', 'Orlando', 'Orange', null::text),
    ('ChIJOzDmBvJ-54gR6XhJQHPs5KI', 'Orlando', 'Orange', null::text),
    ('ChIJqxgi_-J654gRAUVO-nnoTgA', 'Orlando', 'Orange', null::text),
    ('ChIJuQTH2xd754gRUV-O6arVOhQ', 'Orlando', 'Orange', null::text),
    ('ChIJVcr7Ufp654gRkJGTJZILyfc', 'Orlando', 'Orange', null::text),
    ('ChIJz-NtNPx654gR5pilGxE8KDo', 'Orlando', 'Orange', null::text),
    ('ChIJNwQxUnFDw4gRlEruVgcCmu0', 'Osprey', 'Sarasota', null::text),
    ('ChIJHdRIEU2Mk4gRfAM5vKPoRxk', 'Panama City Beach', 'Bay', null::text),
    ('ChIJheIoirLAkIgRPxCpsjJZlYs', 'Pensacola', 'Escambia', null::text),
    ('ChIJs79B6VTHkIgR_GrMBD-pkJk', 'Pensacola', 'Escambia', null::text),
    ('ChIJ8QTtKHMT54gR_ucFCO6b4RE', 'Sanford', 'Seminole', null::text),
    ('ChIJ1YBgZHRAw4gRorfVkB1B6bY', 'Sarasota', 'Sarasota', null::text),
    ('ChIJ3VLBF5Jqw4gRkT1TfU3ULd8', 'Sarasota', 'Sarasota', null::text),
    ('ChIJ6_YRRRJAw4gRE5XF42pZOxo', 'Sarasota', 'Sarasota', null::text),
    ('ChIJ62qtuiVBw4gRFdwvl9Z4X_Y', 'Sarasota', 'Sarasota', null::text),
    ('ChIJ6y2dx9g_w4gRWoZIRhLk-JI', 'Sarasota', 'Sarasota', null::text),
    ('ChIJB_VL5xJAw4gRY58y23x1wBw', 'Sarasota', 'Sarasota', null::text),
    ('ChIJew4bcA9Aw4gR3bU-SA7qAgU', 'Sarasota', 'Sarasota', null::text),
    ('ChIJhRwCTPZAw4gROrb2GkpgkGQ', 'Sarasota', 'Sarasota', null::text),
    ('ChIJLZ2vzRxBw4gRMOtW0ArhBhw', 'Sarasota', 'Sarasota', null::text),
    ('ChIJPWsUhY9Aw4gRoltOtGa3nPM', 'Sarasota', 'Sarasota', null::text),
    ('ChIJq6rO_XtAw4gRV_KGbfGfJ4g', 'Sarasota', 'Sarasota', null::text),
    ('ChIJtcnZQU9Bw4gROmYnVLnl0hE', 'Sarasota', 'Sarasota', null::text),
    ('ChIJK1nJH9xrw4gRIr9IhuzYVQI', 'Siesta Key', 'Sarasota', null::text),
    ('ChIJSZdWvAlqw4gRo53EHrAL5gU', 'Siesta Key', 'Sarasota', null::text),
    ('ChIJ0UaxcHon5IgRtIDfdNZ5UsQ', 'St. Augustine', 'St. Johns', null::text),
    ('ChIJvwS00mgn5IgRdR5IlMxNUp0', 'St. Augustine', 'St. Johns', null::text),
    ('ChIJn2JUR3Bf7IgRDoeGio3YFuE', 'Tallahassee', 'Leon', null::text),
    ('ChIJT8lyCbL07IgR7bBS2PG4XQI', 'Tallahassee', 'Leon', null::text),
    ('ChIJg1HuP9xbw4gRs9PHCFmC4VU', 'Venice', 'Sarasota', null::text),
    ('ChIJHYWhzLpbw4gR-dyWVALZtfw', 'Venice', 'Sarasota', null::text),
    ('ChIJu73by6Rbw4gR857K3YRfLQo', 'Venice', 'Sarasota', null::text),
    ('ChIJB_x-d4nW2IgRA8KT7MrGCis', 'West Palm Beach', 'Palm Beach', null::text),
    ('ChIJLd_uxonW2IgRCHBSV77RI9E', 'West Palm Beach', 'Palm Beach', null::text),
    ('ChIJV8mRgbbX2IgRloAsUHzNI6s', 'West Palm Beach', 'Palm Beach', null::text),
    ('ChIJ38rlfogN3YgRGic46M9dbLw', 'Winter Haven', 'Polk', null::text),
    ('ChIJu5o2QZAN3YgRMruJ3jk1KG8', 'Winter Haven', 'Polk', null::text),
    ('ChIJDahUeGJ654gRTbXyn3JDd0U', 'Winter Park', 'Orange', null::text),
    ('ChIJeYMYltVx54gRB4G-KKYiD8I', 'Winter Park', 'Orange', null::text),
    ('ChIJaWeoBbURw4gRDYfwKuwOVW0', 'Holmes Beach', 'Manatee', null::text),
    ('ChIJeZM_F1A23YgRFICuRhA_pIo', 'Plant City', 'Hillsborough', 'tampa')
  ) as v(place_id, city, cty, mtr)
  left join public.wf_inventory i using (place_id)
  where i.locality is distinct from v.city or i.county is distinct from v.cty
     or (v.mtr is not null and i.metro is distinct from v.mtr);
  if wrong > 0 then raise exception 'county follow-ups: % row(s) do not hold the expected value; rolled back', wrong; end if;
end $$;

commit;

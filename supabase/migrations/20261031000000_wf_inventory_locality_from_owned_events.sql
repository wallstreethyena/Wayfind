-- Census-gated by scripts/gate-locality-census.mjs (--name=20261031000000_wf_inventory_locality_from_owned_events).
-- Candidates: docs/audits/20261031000000_wf_inventory_locality_from_owned_events.csv (one disposition per row)
-- Census evidence: docs/audits/20261031000000_wf_inventory_locality_from_owned_events.census.json
-- Reverse: supabase/data-fixes/20261031000000_wf_inventory_locality_from_owned_events_REVERSE.sql
--
-- Fills wf_inventory.locality for 82 places. Each row needs BOTH:
--   owned evidence: wf_events.city, with the event address's city slot equal
--     to it (scripts/backfill-locality-from-events.mjs, tier A), AND
--   the accepted rule: the US Census place containing the row's own point is
--     that same city (incorporated place, else Census-designated place).
-- Not written: 10 conflicting (point is inside a different Census place),
--   26 unsupported (point is in no Census place: unincorporated).
-- No Google content is read or written; no coordinate is written.
--
-- ROW-LEVEL PRECONDITIONS: each update requires locality AND county to still
-- be empty, so a value set by anyone since the dry run is never overwritten
-- (county set + locality empty is a Census "unincorporated" decision).
-- ALL OR NOTHING: the closing assertion requires every named row to hold
-- exactly the value written; if a concurrent edit made any update skip, the
-- whole transaction rolls back and the rows are re-read, never forced.

begin;

update public.wf_inventory set locality = 'Altamonte Springs'
 where place_id = 'ChIJaRU86ORx54gRK3zyCcF94hw'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- A Petrified Forest Scare Trail
update public.wf_inventory set locality = 'Bradenton'
 where place_id = 'ChIJ550owHsXw4gR4L8ZcLVqA-M'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Flamingo Bay Brewing
update public.wf_inventory set locality = 'Bradenton'
 where place_id = 'ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Bradenton Public Market
update public.wf_inventory set locality = 'Bradenton'
 where place_id = 'ChIJaWJirJcWw4gRboJr7F108HM'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Clancy''s Irish Sports Pub & Grill
update public.wf_inventory set locality = 'Bradenton'
 where place_id = 'ChIJB-QyVtEXw4gRk5F8bn3YV28'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Manatee Performing Arts Center
update public.wf_inventory set locality = 'Bradenton'
 where place_id = 'ChIJhW6JF_MWw4gRUxIRevnpN4k'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- G.T. Bray Park
update public.wf_inventory set locality = 'Bradenton'
 where place_id = 'ChIJy76z4HY9w4gROaX_C6lQu8g'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Manatee Village Historical Park
update public.wf_inventory set locality = 'Clearwater'
 where place_id = 'ChIJiZrtZSvxwogRE9eu4Xpy9Yc'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Clearwater Marine Aquarium
update public.wf_inventory set locality = 'Cocoa'
 where place_id = 'ChIJ40ShwrcB3ogR38px18fDfss'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- River Road Coffee and Popsicles
update public.wf_inventory set locality = 'Coral Gables'
 where place_id = 'ChIJu_e4BnTI2YgREAOg3GxMK8g'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Fairchild Tropical Botanic Garden
update public.wf_inventory set locality = 'Destin'
 where place_id = 'ChIJqQ1Avv5DkYgR19YWeQV8UiQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- HarborWalk Village
update public.wf_inventory set locality = 'Dunedin'
 where place_id = 'ChIJZSzeKLDzwogRSwm6alxyabw'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Frenchy''s Stone Crab and Seafood Market
update public.wf_inventory set locality = 'Fort Lauderdale'
 where place_id = 'ChIJFzRAfooB2YgRtuvhmGrE7RY'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Wharf Fort Lauderdale
update public.wf_inventory set locality = 'Fort Myers'
 where place_id = 'ChIJ96iz9wdq24gRftTmyqbwI64'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Burroughs Home and Gardens
update public.wf_inventory set locality = 'Fort Myers'
 where place_id = 'ChIJVVUNg8JB24gRo5VjblNO_c8'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Edison & Ford Winter Estates
update public.wf_inventory set locality = 'Fort Pierce'
 where place_id = 'ChIJX0UJnszx3ogRKqv856yKO_s'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Heathcote Botanical Gardens
update public.wf_inventory set locality = 'Jacksonville'
 where place_id = 'ChIJYWfOURm35YgRZ6p-Om4KBNM'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Element Bistro Bar and Lounge
update public.wf_inventory set locality = 'Jensen Beach'
 where place_id = 'ChIJWTX7kWvn3ogRRjQhNzC11RQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Children''s Museum of the Treasure Coast
update public.wf_inventory set locality = 'Lake Buena Vista'
 where place_id = 'ChIJDVFcVYZ_3YgRU4PZ5Fw44Ek'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Edison
update public.wf_inventory set locality = 'Lake Buena Vista'
 where place_id = 'ChIJJ4xUsMiB3YgRtioaCI7zFlY'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Frontera Cocina
update public.wf_inventory set locality = 'Lake Buena Vista'
 where place_id = 'ChIJk5xl2oZ_3YgRg7yR_vn87h4'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Chef Art Smith''s Homecomin''
update public.wf_inventory set locality = 'Lake Buena Vista'
 where place_id = 'ChIJOcKapod_3YgR90H_S_UKiMA'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Raglan Road Irish Pub
update public.wf_inventory set locality = 'Lake Buena Vista'
 where place_id = 'ChIJXSjMOWd_3YgR7IaYUVKFrms'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Everglazed Donuts & Cold Brew
update public.wf_inventory set locality = 'Lakeland'
 where place_id = 'ChIJ1dJMdEc43YgRmII076Tbhmg'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Silver Moon Drive-In Theatre
update public.wf_inventory set locality = 'Maitland'
 where place_id = 'ChIJ-WLCqkdw54gR5FyZzXYSoV4'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Enzian Theater
update public.wf_inventory set locality = 'Miami Beach'
 where place_id = 'ChIJBVShAmez2YgRvNWv6nIzzzY'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Faena Miami Beach
update public.wf_inventory set locality = 'Miami'
 where place_id = 'ChIJI-aAsE-32YgRlQrq8LqdUa8'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Giselle Miami
update public.wf_inventory set locality = 'Miami'
 where place_id = 'ChIJK69z3qO22YgROBJC2vDIXAI'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- CLUB SPACE
update public.wf_inventory set locality = 'Miami'
 where place_id = 'ChIJo83NFCqx2YgRXsS12ziKrO8'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Sylvester
update public.wf_inventory set locality = 'Miami'
 where place_id = 'ChIJoVWX_Rm02YgRllHsIZGN16c'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Miami Children''s Museum
update public.wf_inventory set locality = 'Ocoee'
 where place_id = 'ChIJnU1-CO1554gRuvTm3EZVA9Y'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Rock ''N Rev Ocoee
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJ231qjvF754gRZX6vzhb2aCk'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Great Southern Box Company
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJ7aIAgJd654gRjUN8WsPaaI4'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Orlando Museum of Art
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJaybvA3N754gRTQX-9RlrMko'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Euphoria Downtown
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJb2Fn68t554gRrVzqlpOn-hk'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Orlando Amphitheater
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJbbY73up654gRsbf2dTWiCas'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Will''s Pub
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJbVPT1f1654gRJvFabQEhowU'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Bullitt Bar
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJcQyYH85654gRPh6gV_UpsDY'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Festival Park
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJEwDtLpl754gR0qE-zUCv6PQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Grape and the Grain Wine Bar
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJHWBuq9p654gR5Pz28aJykCc'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Plaza Live
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJMfdMl_5654gRpZP9kPXrotU'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Beacham
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJncyg0v1654gRzcygkvMIsg0'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Celine Orlando
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJo2bql5B654gR_ITN9PGhBbU'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Orlando Science Center
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJOZ6tqU5754gRmHz-pzzl33s'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Zymarium Meadery
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJOzDmBvJ-54gR6XhJQHPs5KI'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Rum Jungle
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJqxgi_-J654gRAUVO-nnoTgA'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Abbey
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJuQTH2xd754gRUV-O6arVOhQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Final Whistle at Thornton Park Pub
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJVcr7Ufp654gRkJGTJZILyfc'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Kia Center
update public.wf_inventory set locality = 'Orlando'
 where place_id = 'ChIJz-NtNPx654gR5pilGxE8KDo'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Stagger Inn
update public.wf_inventory set locality = 'Osprey'
 where place_id = 'ChIJNwQxUnFDw4gRlEruVgcCmu0'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Historic Spanish Point
update public.wf_inventory set locality = 'Panama City Beach'
 where place_id = 'ChIJHdRIEU2Mk4gRfAM5vKPoRxk'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Frank Brown Park
update public.wf_inventory set locality = 'Pensacola'
 where place_id = 'ChIJheIoirLAkIgRPxCpsjJZlYs'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Historic Pensacola Village
update public.wf_inventory set locality = 'Pensacola'
 where place_id = 'ChIJs79B6VTHkIgR_GrMBD-pkJk'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Vince J. Whibbs Sr. Community Maritime Park
update public.wf_inventory set locality = 'Sanford'
 where place_id = 'ChIJ8QTtKHMT54gR_ucFCO6b4RE'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Barn in Sanford
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJ1YBgZHRAw4gRorfVkB1B6bY'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Sarasota Children''s Garden
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJ3VLBF5Jqw4gRkT1TfU3ULd8'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- St. Armands Circle
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJ6_YRRRJAw4gRE5XF42pZOxo'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Sarasota Opera House
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJ62qtuiVBw4gRFdwvl9Z4X_Y'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Perspective Rooftop Pool Bar
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJ6y2dx9g_w4gRWoZIRhLk-JI'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The John and Mable Ringling Museum of Art
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJB_VL5xJAw4gRY58y23x1wBw'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Joe''s On Main
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJew4bcA9Aw4gR3bU-SA7qAgU'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Van Wezel Performing Arts Hall
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJhRwCTPZAw4gROrb2GkpgkGQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Arlington Park Sarasota
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJLZ2vzRxBw4gRMOtW0ArhBhw'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Bay Park
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJPWsUhY9Aw4gRoltOtGa3nPM'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Sarasota Fairgrounds
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJq6rO_XtAw4gRV_KGbfGfJ4g'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Bazaar on Apricot & Lime Indie Market
update public.wf_inventory set locality = 'Sarasota'
 where place_id = 'ChIJtcnZQU9Bw4gROmYnVLnl0hE'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Sage Restaurant
update public.wf_inventory set locality = 'Siesta Key'
 where place_id = 'ChIJK1nJH9xrw4gRIr9IhuzYVQI'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Siesta Key Village
update public.wf_inventory set locality = 'Siesta Key'
 where place_id = 'ChIJSZdWvAlqw4gRo53EHrAL5gU'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Blasé Martini Bar & 3.14 Pi Pizza
update public.wf_inventory set locality = 'St. Augustine'
 where place_id = 'ChIJ0UaxcHon5IgRtIDfdNZ5UsQ'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- St. Augustine Alligator Farm Zoological Park
update public.wf_inventory set locality = 'St. Augustine'
 where place_id = 'ChIJvwS00mgn5IgRdR5IlMxNUp0'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Anastasia State Park
update public.wf_inventory set locality = 'Tallahassee'
 where place_id = 'ChIJn2JUR3Bf7IgRDoeGio3YFuE'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Goodwood Museum & Gardens
update public.wf_inventory set locality = 'Tallahassee'
 where place_id = 'ChIJT8lyCbL07IgR7bBS2PG4XQI'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Tallahassee Museum
update public.wf_inventory set locality = 'Venice'
 where place_id = 'ChIJg1HuP9xbw4gRs9PHCFmC4VU'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Maxine Barritt Park
update public.wf_inventory set locality = 'Venice'
 where place_id = 'ChIJHYWhzLpbw4gR-dyWVALZtfw'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Historic Downtown Venice, FL
update public.wf_inventory set locality = 'Venice'
 where place_id = 'ChIJu73by6Rbw4gR857K3YRfLQo'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Centennial Park
update public.wf_inventory set locality = 'West Palm Beach'
 where place_id = 'ChIJB_x-d4nW2IgRA8KT7MrGCis'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Camelot
update public.wf_inventory set locality = 'West Palm Beach'
 where place_id = 'ChIJLd_uxonW2IgRCHBSV77RI9E'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Roxy''s Pub
update public.wf_inventory set locality = 'West Palm Beach'
 where place_id = 'ChIJV8mRgbbX2IgRloAsUHzNI6s'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Treehouse
update public.wf_inventory set locality = 'Winter Haven'
 where place_id = 'ChIJ38rlfogN3YgRGic46M9dbLw'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- LEGOLAND® Florida Resort
update public.wf_inventory set locality = 'Winter Haven'
 where place_id = 'ChIJu5o2QZAN3YgRMruJ3jk1KG8'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- PEPPA PIG Theme Park Florida
update public.wf_inventory set locality = 'Winter Park'
 where place_id = 'ChIJDahUeGJ654gRTbXyn3JDd0U'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- The Courtesy
update public.wf_inventory set locality = 'Winter Park'
 where place_id = 'ChIJeYMYltVx54gRB4G-KKYiD8I'
   and btrim(coalesce(locality,'')) = ''
   and btrim(coalesce(county,'')) = '';  -- Forward Slash Distillery & Blending House

do $$
declare wrong int;
begin
  select count(*) into wrong from (values
    ('ChIJaRU86ORx54gRK3zyCcF94hw','Altamonte Springs'),
    ('ChIJ550owHsXw4gR4L8ZcLVqA-M','Bradenton'),
    ('ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ','Bradenton'),
    ('ChIJaWJirJcWw4gRboJr7F108HM','Bradenton'),
    ('ChIJB-QyVtEXw4gRk5F8bn3YV28','Bradenton'),
    ('ChIJhW6JF_MWw4gRUxIRevnpN4k','Bradenton'),
    ('ChIJy76z4HY9w4gROaX_C6lQu8g','Bradenton'),
    ('ChIJiZrtZSvxwogRE9eu4Xpy9Yc','Clearwater'),
    ('ChIJ40ShwrcB3ogR38px18fDfss','Cocoa'),
    ('ChIJu_e4BnTI2YgREAOg3GxMK8g','Coral Gables'),
    ('ChIJqQ1Avv5DkYgR19YWeQV8UiQ','Destin'),
    ('ChIJZSzeKLDzwogRSwm6alxyabw','Dunedin'),
    ('ChIJFzRAfooB2YgRtuvhmGrE7RY','Fort Lauderdale'),
    ('ChIJ96iz9wdq24gRftTmyqbwI64','Fort Myers'),
    ('ChIJVVUNg8JB24gRo5VjblNO_c8','Fort Myers'),
    ('ChIJX0UJnszx3ogRKqv856yKO_s','Fort Pierce'),
    ('ChIJYWfOURm35YgRZ6p-Om4KBNM','Jacksonville'),
    ('ChIJWTX7kWvn3ogRRjQhNzC11RQ','Jensen Beach'),
    ('ChIJDVFcVYZ_3YgRU4PZ5Fw44Ek','Lake Buena Vista'),
    ('ChIJJ4xUsMiB3YgRtioaCI7zFlY','Lake Buena Vista'),
    ('ChIJk5xl2oZ_3YgRg7yR_vn87h4','Lake Buena Vista'),
    ('ChIJOcKapod_3YgR90H_S_UKiMA','Lake Buena Vista'),
    ('ChIJXSjMOWd_3YgR7IaYUVKFrms','Lake Buena Vista'),
    ('ChIJ1dJMdEc43YgRmII076Tbhmg','Lakeland'),
    ('ChIJ-WLCqkdw54gR5FyZzXYSoV4','Maitland'),
    ('ChIJBVShAmez2YgRvNWv6nIzzzY','Miami Beach'),
    ('ChIJI-aAsE-32YgRlQrq8LqdUa8','Miami'),
    ('ChIJK69z3qO22YgROBJC2vDIXAI','Miami'),
    ('ChIJo83NFCqx2YgRXsS12ziKrO8','Miami'),
    ('ChIJoVWX_Rm02YgRllHsIZGN16c','Miami'),
    ('ChIJnU1-CO1554gRuvTm3EZVA9Y','Ocoee'),
    ('ChIJ231qjvF754gRZX6vzhb2aCk','Orlando'),
    ('ChIJ7aIAgJd654gRjUN8WsPaaI4','Orlando'),
    ('ChIJaybvA3N754gRTQX-9RlrMko','Orlando'),
    ('ChIJb2Fn68t554gRrVzqlpOn-hk','Orlando'),
    ('ChIJbbY73up654gRsbf2dTWiCas','Orlando'),
    ('ChIJbVPT1f1654gRJvFabQEhowU','Orlando'),
    ('ChIJcQyYH85654gRPh6gV_UpsDY','Orlando'),
    ('ChIJEwDtLpl754gR0qE-zUCv6PQ','Orlando'),
    ('ChIJHWBuq9p654gR5Pz28aJykCc','Orlando'),
    ('ChIJMfdMl_5654gRpZP9kPXrotU','Orlando'),
    ('ChIJncyg0v1654gRzcygkvMIsg0','Orlando'),
    ('ChIJo2bql5B654gR_ITN9PGhBbU','Orlando'),
    ('ChIJOZ6tqU5754gRmHz-pzzl33s','Orlando'),
    ('ChIJOzDmBvJ-54gR6XhJQHPs5KI','Orlando'),
    ('ChIJqxgi_-J654gRAUVO-nnoTgA','Orlando'),
    ('ChIJuQTH2xd754gRUV-O6arVOhQ','Orlando'),
    ('ChIJVcr7Ufp654gRkJGTJZILyfc','Orlando'),
    ('ChIJz-NtNPx654gR5pilGxE8KDo','Orlando'),
    ('ChIJNwQxUnFDw4gRlEruVgcCmu0','Osprey'),
    ('ChIJHdRIEU2Mk4gRfAM5vKPoRxk','Panama City Beach'),
    ('ChIJheIoirLAkIgRPxCpsjJZlYs','Pensacola'),
    ('ChIJs79B6VTHkIgR_GrMBD-pkJk','Pensacola'),
    ('ChIJ8QTtKHMT54gR_ucFCO6b4RE','Sanford'),
    ('ChIJ1YBgZHRAw4gRorfVkB1B6bY','Sarasota'),
    ('ChIJ3VLBF5Jqw4gRkT1TfU3ULd8','Sarasota'),
    ('ChIJ6_YRRRJAw4gRE5XF42pZOxo','Sarasota'),
    ('ChIJ62qtuiVBw4gRFdwvl9Z4X_Y','Sarasota'),
    ('ChIJ6y2dx9g_w4gRWoZIRhLk-JI','Sarasota'),
    ('ChIJB_VL5xJAw4gRY58y23x1wBw','Sarasota'),
    ('ChIJew4bcA9Aw4gR3bU-SA7qAgU','Sarasota'),
    ('ChIJhRwCTPZAw4gROrb2GkpgkGQ','Sarasota'),
    ('ChIJLZ2vzRxBw4gRMOtW0ArhBhw','Sarasota'),
    ('ChIJPWsUhY9Aw4gRoltOtGa3nPM','Sarasota'),
    ('ChIJq6rO_XtAw4gRV_KGbfGfJ4g','Sarasota'),
    ('ChIJtcnZQU9Bw4gROmYnVLnl0hE','Sarasota'),
    ('ChIJK1nJH9xrw4gRIr9IhuzYVQI','Siesta Key'),
    ('ChIJSZdWvAlqw4gRo53EHrAL5gU','Siesta Key'),
    ('ChIJ0UaxcHon5IgRtIDfdNZ5UsQ','St. Augustine'),
    ('ChIJvwS00mgn5IgRdR5IlMxNUp0','St. Augustine'),
    ('ChIJn2JUR3Bf7IgRDoeGio3YFuE','Tallahassee'),
    ('ChIJT8lyCbL07IgR7bBS2PG4XQI','Tallahassee'),
    ('ChIJg1HuP9xbw4gRs9PHCFmC4VU','Venice'),
    ('ChIJHYWhzLpbw4gR-dyWVALZtfw','Venice'),
    ('ChIJu73by6Rbw4gR857K3YRfLQo','Venice'),
    ('ChIJB_x-d4nW2IgRA8KT7MrGCis','West Palm Beach'),
    ('ChIJLd_uxonW2IgRCHBSV77RI9E','West Palm Beach'),
    ('ChIJV8mRgbbX2IgRloAsUHzNI6s','West Palm Beach'),
    ('ChIJ38rlfogN3YgRGic46M9dbLw','Winter Haven'),
    ('ChIJu5o2QZAN3YgRMruJ3jk1KG8','Winter Haven'),
    ('ChIJDahUeGJ654gRTbXyn3JDd0U','Winter Park'),
    ('ChIJeYMYltVx54gRB4G-KKYiD8I','Winter Park')
  ) as v(place_id, city)
  left join public.wf_inventory i using (place_id)
  where i.locality is distinct from v.city;
  if wrong > 0 then raise exception 'locality backfill: % row(s) do not hold the gated value; rolled back', wrong; end if;
end $$;

commit;

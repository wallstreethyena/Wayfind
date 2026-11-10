-- Reverse of supabase/migrations/20261031000000_wf_inventory_locality_from_owned_events.sql
-- Before-image: every one of these 82 rows had locality and county empty.
-- Clears ONLY a locality still exactly as that migration wrote it, so a later edit is never discarded.

begin;

update public.wf_inventory set locality = null
 where place_id = 'ChIJaRU86ORx54gRK3zyCcF94hw' and locality = 'Altamonte Springs';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ550owHsXw4gR4L8ZcLVqA-M' and locality = 'Bradenton';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ' and locality = 'Bradenton';
update public.wf_inventory set locality = null
 where place_id = 'ChIJaWJirJcWw4gRboJr7F108HM' and locality = 'Bradenton';
update public.wf_inventory set locality = null
 where place_id = 'ChIJB-QyVtEXw4gRk5F8bn3YV28' and locality = 'Bradenton';
update public.wf_inventory set locality = null
 where place_id = 'ChIJhW6JF_MWw4gRUxIRevnpN4k' and locality = 'Bradenton';
update public.wf_inventory set locality = null
 where place_id = 'ChIJy76z4HY9w4gROaX_C6lQu8g' and locality = 'Bradenton';
update public.wf_inventory set locality = null
 where place_id = 'ChIJiZrtZSvxwogRE9eu4Xpy9Yc' and locality = 'Clearwater';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ40ShwrcB3ogR38px18fDfss' and locality = 'Cocoa';
update public.wf_inventory set locality = null
 where place_id = 'ChIJu_e4BnTI2YgREAOg3GxMK8g' and locality = 'Coral Gables';
update public.wf_inventory set locality = null
 where place_id = 'ChIJqQ1Avv5DkYgR19YWeQV8UiQ' and locality = 'Destin';
update public.wf_inventory set locality = null
 where place_id = 'ChIJZSzeKLDzwogRSwm6alxyabw' and locality = 'Dunedin';
update public.wf_inventory set locality = null
 where place_id = 'ChIJFzRAfooB2YgRtuvhmGrE7RY' and locality = 'Fort Lauderdale';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ96iz9wdq24gRftTmyqbwI64' and locality = 'Fort Myers';
update public.wf_inventory set locality = null
 where place_id = 'ChIJVVUNg8JB24gRo5VjblNO_c8' and locality = 'Fort Myers';
update public.wf_inventory set locality = null
 where place_id = 'ChIJX0UJnszx3ogRKqv856yKO_s' and locality = 'Fort Pierce';
update public.wf_inventory set locality = null
 where place_id = 'ChIJYWfOURm35YgRZ6p-Om4KBNM' and locality = 'Jacksonville';
update public.wf_inventory set locality = null
 where place_id = 'ChIJWTX7kWvn3ogRRjQhNzC11RQ' and locality = 'Jensen Beach';
update public.wf_inventory set locality = null
 where place_id = 'ChIJDVFcVYZ_3YgRU4PZ5Fw44Ek' and locality = 'Lake Buena Vista';
update public.wf_inventory set locality = null
 where place_id = 'ChIJJ4xUsMiB3YgRtioaCI7zFlY' and locality = 'Lake Buena Vista';
update public.wf_inventory set locality = null
 where place_id = 'ChIJk5xl2oZ_3YgRg7yR_vn87h4' and locality = 'Lake Buena Vista';
update public.wf_inventory set locality = null
 where place_id = 'ChIJOcKapod_3YgR90H_S_UKiMA' and locality = 'Lake Buena Vista';
update public.wf_inventory set locality = null
 where place_id = 'ChIJXSjMOWd_3YgR7IaYUVKFrms' and locality = 'Lake Buena Vista';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ1dJMdEc43YgRmII076Tbhmg' and locality = 'Lakeland';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ-WLCqkdw54gR5FyZzXYSoV4' and locality = 'Maitland';
update public.wf_inventory set locality = null
 where place_id = 'ChIJBVShAmez2YgRvNWv6nIzzzY' and locality = 'Miami Beach';
update public.wf_inventory set locality = null
 where place_id = 'ChIJI-aAsE-32YgRlQrq8LqdUa8' and locality = 'Miami';
update public.wf_inventory set locality = null
 where place_id = 'ChIJK69z3qO22YgROBJC2vDIXAI' and locality = 'Miami';
update public.wf_inventory set locality = null
 where place_id = 'ChIJo83NFCqx2YgRXsS12ziKrO8' and locality = 'Miami';
update public.wf_inventory set locality = null
 where place_id = 'ChIJoVWX_Rm02YgRllHsIZGN16c' and locality = 'Miami';
update public.wf_inventory set locality = null
 where place_id = 'ChIJnU1-CO1554gRuvTm3EZVA9Y' and locality = 'Ocoee';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ231qjvF754gRZX6vzhb2aCk' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ7aIAgJd654gRjUN8WsPaaI4' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJaybvA3N754gRTQX-9RlrMko' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJb2Fn68t554gRrVzqlpOn-hk' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJbbY73up654gRsbf2dTWiCas' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJbVPT1f1654gRJvFabQEhowU' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJcQyYH85654gRPh6gV_UpsDY' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJEwDtLpl754gR0qE-zUCv6PQ' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJHWBuq9p654gR5Pz28aJykCc' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJMfdMl_5654gRpZP9kPXrotU' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJncyg0v1654gRzcygkvMIsg0' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJo2bql5B654gR_ITN9PGhBbU' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJOZ6tqU5754gRmHz-pzzl33s' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJOzDmBvJ-54gR6XhJQHPs5KI' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJqxgi_-J654gRAUVO-nnoTgA' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJuQTH2xd754gRUV-O6arVOhQ' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJVcr7Ufp654gRkJGTJZILyfc' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJz-NtNPx654gR5pilGxE8KDo' and locality = 'Orlando';
update public.wf_inventory set locality = null
 where place_id = 'ChIJNwQxUnFDw4gRlEruVgcCmu0' and locality = 'Osprey';
update public.wf_inventory set locality = null
 where place_id = 'ChIJHdRIEU2Mk4gRfAM5vKPoRxk' and locality = 'Panama City Beach';
update public.wf_inventory set locality = null
 where place_id = 'ChIJheIoirLAkIgRPxCpsjJZlYs' and locality = 'Pensacola';
update public.wf_inventory set locality = null
 where place_id = 'ChIJs79B6VTHkIgR_GrMBD-pkJk' and locality = 'Pensacola';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ8QTtKHMT54gR_ucFCO6b4RE' and locality = 'Sanford';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ1YBgZHRAw4gRorfVkB1B6bY' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ3VLBF5Jqw4gRkT1TfU3ULd8' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ6_YRRRJAw4gRE5XF42pZOxo' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ62qtuiVBw4gRFdwvl9Z4X_Y' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ6y2dx9g_w4gRWoZIRhLk-JI' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJB_VL5xJAw4gRY58y23x1wBw' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJew4bcA9Aw4gR3bU-SA7qAgU' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJhRwCTPZAw4gROrb2GkpgkGQ' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJLZ2vzRxBw4gRMOtW0ArhBhw' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJPWsUhY9Aw4gRoltOtGa3nPM' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJq6rO_XtAw4gRV_KGbfGfJ4g' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJtcnZQU9Bw4gROmYnVLnl0hE' and locality = 'Sarasota';
update public.wf_inventory set locality = null
 where place_id = 'ChIJK1nJH9xrw4gRIr9IhuzYVQI' and locality = 'Siesta Key';
update public.wf_inventory set locality = null
 where place_id = 'ChIJSZdWvAlqw4gRo53EHrAL5gU' and locality = 'Siesta Key';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ0UaxcHon5IgRtIDfdNZ5UsQ' and locality = 'St. Augustine';
update public.wf_inventory set locality = null
 where place_id = 'ChIJvwS00mgn5IgRdR5IlMxNUp0' and locality = 'St. Augustine';
update public.wf_inventory set locality = null
 where place_id = 'ChIJn2JUR3Bf7IgRDoeGio3YFuE' and locality = 'Tallahassee';
update public.wf_inventory set locality = null
 where place_id = 'ChIJT8lyCbL07IgR7bBS2PG4XQI' and locality = 'Tallahassee';
update public.wf_inventory set locality = null
 where place_id = 'ChIJg1HuP9xbw4gRs9PHCFmC4VU' and locality = 'Venice';
update public.wf_inventory set locality = null
 where place_id = 'ChIJHYWhzLpbw4gR-dyWVALZtfw' and locality = 'Venice';
update public.wf_inventory set locality = null
 where place_id = 'ChIJu73by6Rbw4gR857K3YRfLQo' and locality = 'Venice';
update public.wf_inventory set locality = null
 where place_id = 'ChIJB_x-d4nW2IgRA8KT7MrGCis' and locality = 'West Palm Beach';
update public.wf_inventory set locality = null
 where place_id = 'ChIJLd_uxonW2IgRCHBSV77RI9E' and locality = 'West Palm Beach';
update public.wf_inventory set locality = null
 where place_id = 'ChIJV8mRgbbX2IgRloAsUHzNI6s' and locality = 'West Palm Beach';
update public.wf_inventory set locality = null
 where place_id = 'ChIJ38rlfogN3YgRGic46M9dbLw' and locality = 'Winter Haven';
update public.wf_inventory set locality = null
 where place_id = 'ChIJu5o2QZAN3YgRMruJ3jk1KG8' and locality = 'Winter Haven';
update public.wf_inventory set locality = null
 where place_id = 'ChIJDahUeGJ654gRTbXyn3JDd0U' and locality = 'Winter Park';
update public.wf_inventory set locality = null
 where place_id = 'ChIJeYMYltVx54gRB4G-KKYiD8I' and locality = 'Winter Park';

commit;

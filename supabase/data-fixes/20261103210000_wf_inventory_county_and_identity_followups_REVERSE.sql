-- Reverse of supabase/migrations/20261103210000_wf_inventory_county_and_identity_followups.sql
-- Before-image (read 2026-11-03 ~21Z): the 82 rows had county NULL; the Holmes Beach
-- beach card had locality NULL and county NULL; Sir Henry's metro was 'tampa-bay'.
-- Each statement only touches a row still holding the value the migration wrote.

begin;

update public.wf_inventory set county = null where place_id = 'ChIJaRU86ORx54gRK3zyCcF94hw' and county = 'Seminole';
update public.wf_inventory set county = null where place_id = 'ChIJ550owHsXw4gR4L8ZcLVqA-M' and county = 'Manatee';
update public.wf_inventory set county = null where place_id = 'ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ' and county = 'Manatee';
update public.wf_inventory set county = null where place_id = 'ChIJaWJirJcWw4gRboJr7F108HM' and county = 'Manatee';
update public.wf_inventory set county = null where place_id = 'ChIJB-QyVtEXw4gRk5F8bn3YV28' and county = 'Manatee';
update public.wf_inventory set county = null where place_id = 'ChIJhW6JF_MWw4gRUxIRevnpN4k' and county = 'Manatee';
update public.wf_inventory set county = null where place_id = 'ChIJy76z4HY9w4gROaX_C6lQu8g' and county = 'Manatee';
update public.wf_inventory set county = null where place_id = 'ChIJiZrtZSvxwogRE9eu4Xpy9Yc' and county = 'Pinellas';
update public.wf_inventory set county = null where place_id = 'ChIJ40ShwrcB3ogR38px18fDfss' and county = 'Brevard';
update public.wf_inventory set county = null where place_id = 'ChIJu_e4BnTI2YgREAOg3GxMK8g' and county = 'Miami-Dade';
update public.wf_inventory set county = null where place_id = 'ChIJqQ1Avv5DkYgR19YWeQV8UiQ' and county = 'Okaloosa';
update public.wf_inventory set county = null where place_id = 'ChIJZSzeKLDzwogRSwm6alxyabw' and county = 'Pinellas';
update public.wf_inventory set county = null where place_id = 'ChIJFzRAfooB2YgRtuvhmGrE7RY' and county = 'Broward';
update public.wf_inventory set county = null where place_id = 'ChIJ96iz9wdq24gRftTmyqbwI64' and county = 'Lee';
update public.wf_inventory set county = null where place_id = 'ChIJVVUNg8JB24gRo5VjblNO_c8' and county = 'Lee';
update public.wf_inventory set county = null where place_id = 'ChIJX0UJnszx3ogRKqv856yKO_s' and county = 'St. Lucie';
update public.wf_inventory set county = null where place_id = 'ChIJYWfOURm35YgRZ6p-Om4KBNM' and county = 'Duval';
update public.wf_inventory set county = null where place_id = 'ChIJWTX7kWvn3ogRRjQhNzC11RQ' and county = 'Martin';
update public.wf_inventory set county = null where place_id = 'ChIJDVFcVYZ_3YgRU4PZ5Fw44Ek' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJJ4xUsMiB3YgRtioaCI7zFlY' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJk5xl2oZ_3YgRg7yR_vn87h4' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJOcKapod_3YgR90H_S_UKiMA' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJXSjMOWd_3YgR7IaYUVKFrms' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJ1dJMdEc43YgRmII076Tbhmg' and county = 'Polk';
update public.wf_inventory set county = null where place_id = 'ChIJ-WLCqkdw54gR5FyZzXYSoV4' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJBVShAmez2YgRvNWv6nIzzzY' and county = 'Miami-Dade';
update public.wf_inventory set county = null where place_id = 'ChIJI-aAsE-32YgRlQrq8LqdUa8' and county = 'Miami-Dade';
update public.wf_inventory set county = null where place_id = 'ChIJK69z3qO22YgROBJC2vDIXAI' and county = 'Miami-Dade';
update public.wf_inventory set county = null where place_id = 'ChIJo83NFCqx2YgRXsS12ziKrO8' and county = 'Miami-Dade';
update public.wf_inventory set county = null where place_id = 'ChIJoVWX_Rm02YgRllHsIZGN16c' and county = 'Miami-Dade';
update public.wf_inventory set county = null where place_id = 'ChIJnU1-CO1554gRuvTm3EZVA9Y' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJ231qjvF754gRZX6vzhb2aCk' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJ7aIAgJd654gRjUN8WsPaaI4' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJaybvA3N754gRTQX-9RlrMko' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJb2Fn68t554gRrVzqlpOn-hk' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJbbY73up654gRsbf2dTWiCas' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJbVPT1f1654gRJvFabQEhowU' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJcQyYH85654gRPh6gV_UpsDY' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJEwDtLpl754gR0qE-zUCv6PQ' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJHWBuq9p654gR5Pz28aJykCc' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJMfdMl_5654gRpZP9kPXrotU' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJncyg0v1654gRzcygkvMIsg0' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJo2bql5B654gR_ITN9PGhBbU' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJOZ6tqU5754gRmHz-pzzl33s' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJOzDmBvJ-54gR6XhJQHPs5KI' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJqxgi_-J654gRAUVO-nnoTgA' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJuQTH2xd754gRUV-O6arVOhQ' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJVcr7Ufp654gRkJGTJZILyfc' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJz-NtNPx654gR5pilGxE8KDo' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJNwQxUnFDw4gRlEruVgcCmu0' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJHdRIEU2Mk4gRfAM5vKPoRxk' and county = 'Bay';
update public.wf_inventory set county = null where place_id = 'ChIJheIoirLAkIgRPxCpsjJZlYs' and county = 'Escambia';
update public.wf_inventory set county = null where place_id = 'ChIJs79B6VTHkIgR_GrMBD-pkJk' and county = 'Escambia';
update public.wf_inventory set county = null where place_id = 'ChIJ8QTtKHMT54gR_ucFCO6b4RE' and county = 'Seminole';
update public.wf_inventory set county = null where place_id = 'ChIJ1YBgZHRAw4gRorfVkB1B6bY' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJ3VLBF5Jqw4gRkT1TfU3ULd8' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJ6_YRRRJAw4gRE5XF42pZOxo' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJ62qtuiVBw4gRFdwvl9Z4X_Y' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJ6y2dx9g_w4gRWoZIRhLk-JI' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJB_VL5xJAw4gRY58y23x1wBw' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJew4bcA9Aw4gR3bU-SA7qAgU' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJhRwCTPZAw4gROrb2GkpgkGQ' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJLZ2vzRxBw4gRMOtW0ArhBhw' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJPWsUhY9Aw4gRoltOtGa3nPM' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJq6rO_XtAw4gRV_KGbfGfJ4g' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJtcnZQU9Bw4gROmYnVLnl0hE' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJK1nJH9xrw4gRIr9IhuzYVQI' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJSZdWvAlqw4gRo53EHrAL5gU' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJ0UaxcHon5IgRtIDfdNZ5UsQ' and county = 'St. Johns';
update public.wf_inventory set county = null where place_id = 'ChIJvwS00mgn5IgRdR5IlMxNUp0' and county = 'St. Johns';
update public.wf_inventory set county = null where place_id = 'ChIJn2JUR3Bf7IgRDoeGio3YFuE' and county = 'Leon';
update public.wf_inventory set county = null where place_id = 'ChIJT8lyCbL07IgR7bBS2PG4XQI' and county = 'Leon';
update public.wf_inventory set county = null where place_id = 'ChIJg1HuP9xbw4gRs9PHCFmC4VU' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJHYWhzLpbw4gR-dyWVALZtfw' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJu73by6Rbw4gR857K3YRfLQo' and county = 'Sarasota';
update public.wf_inventory set county = null where place_id = 'ChIJB_x-d4nW2IgRA8KT7MrGCis' and county = 'Palm Beach';
update public.wf_inventory set county = null where place_id = 'ChIJLd_uxonW2IgRCHBSV77RI9E' and county = 'Palm Beach';
update public.wf_inventory set county = null where place_id = 'ChIJV8mRgbbX2IgRloAsUHzNI6s' and county = 'Palm Beach';
update public.wf_inventory set county = null where place_id = 'ChIJ38rlfogN3YgRGic46M9dbLw' and county = 'Polk';
update public.wf_inventory set county = null where place_id = 'ChIJu5o2QZAN3YgRMruJ3jk1KG8' and county = 'Polk';
update public.wf_inventory set county = null where place_id = 'ChIJDahUeGJ654gRTbXyn3JDd0U' and county = 'Orange';
update public.wf_inventory set county = null where place_id = 'ChIJeYMYltVx54gRB4G-KKYiD8I' and county = 'Orange';

update public.wf_inventory set locality = null, county = null
 where place_id = 'ChIJaWeoBbURw4gRDYfwKuwOVW0' and locality = 'Holmes Beach' and county = 'Manatee';

update public.wf_inventory set metro = 'tampa-bay'
 where place_id = 'ChIJeZM_F1A23YgRFICuRhA_pIo' and metro = 'tampa';

commit;

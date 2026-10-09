-- Christmas 2026: verified map locations for five events that could not render
-- (null lat/lng). Owner authorized these scoped data updates on 2026-10-08.
-- Scope: exactly five wf_events rows, location fields only. Prior values were
-- NULL for lat, lng and place_id (address shown below where it changed).
-- Boat parades get a clearly labeled public viewing / start location, never a
-- guessed point on open water.
--
-- Sources:
--  cocoa-beach: City of Cocoa Beach newsletter (cityofcocoabeach.com CivicSend
--    message 247450): "Parade starts at Marker 101 near Centennial Park on State
--    Road 520 ... across from Cape Canaveral Hospital". Point = the SR 520 /
--    Banana River causeway spot at that start (coordinates of the Sunset Cafe
--    row at SR 520 and Banana River, wf_inventory ChIJefKesvOn4IgRE716aWnty4g).
--  fort-myers-beach: fortmyersbeach.org event page: boats assemble at Salty
--    Sam's Marina and the parade departs there; Salty Sam's Marina, 2500 Main St,
--    Fort Myers Beach, 26.45664, -81.94332 (marinas.com listing).
--  palm-beach: thepalmbeaches.com event page: route North Palm Beach Marina to
--    Jupiter; public viewing parks include Bert Winters Park. Bert Winters Park,
--    13425 Ellison Wilson Rd, Juno Beach, 26.8742123, -80.065773 (marinas.com).
--  winter-park: Winter Park Chamber event page: Sat Dec 5, 2026, 9:00 to
--    10:30 AM, south along Park Avenue from Cole Ave to Lyman Ave. Point = Central
--    Park on Park Avenue (wf_inventory ChIJ3TSFiBBw54gRM5repItsIWI, 28.5978454,
--    -81.3514572; Wikipedia Downtown Winter Park Historic District 28.59722,
--    -81.35194).
--  florida-botanical: flbgfoundation.org/holiday-lights: Florida Botanical
--    Gardens, 12520 Ulmerton Road, Largo, FL 33774; Wikipedia coordinates
--    27.8831, -82.80861.

begin;

update wf_events set
  lat = 28.3572415, lng = -80.6146691,
  address = 'Parade start: Marker 101 near Centennial Park on SR 520 (Cocoa Beach Causeway at the Banana River)',
  verify_note = concat_ws(' | ', verify_note, '2026-10-08 location: city of Cocoa Beach names Marker 101 near Centennial Park on SR 520 as the start; point is the causeway at the Banana River (owner authorized)'),
  updated_at = now()
where event_id = 'cocoa-beach-holiday-boat-parade-2026' and lat is null and lng is null;

update wf_events set
  lat = 26.45664, lng = -81.94332,
  address = 'Parade start: Salty Sam''s Marina, 2500 Main St, Fort Myers Beach, FL 33931 (watch from the back bay waterfront)',
  verify_note = concat_ws(' | ', verify_note, '2026-10-08 location: organizer says boats assemble and depart at Salty Sam''s Marina (owner authorized)'),
  updated_at = now()
where event_id = 'fort-myers-beach-christmas-boat-parade-2026' and lat is null and lng is null;

update wf_events set
  lat = 26.8742123, lng = -80.065773,
  address = 'Public viewing: Bert Winters Park, 13425 Ellison Wilson Rd, Juno Beach, FL (route: North Palm Beach Marina to Jupiter Inlet)',
  verify_note = concat_ws(' | ', verify_note, '2026-10-08 location: Bert Winters Park is a named public viewing park on the route (owner authorized)'),
  updated_at = now()
where event_id = 'palm-beach-holiday-boat-parade-2026' and lat is null and lng is null;

update wf_events set
  lat = 28.5978454, lng = -81.3514572,
  address = 'Park Avenue, Winter Park, FL 32789 (route: Cole Ave to Lyman Ave, along Central Park)',
  verify_note = concat_ws(' | ', verify_note, '2026-10-08 location: Chamber route is Park Ave from Cole Ave to Lyman Ave; point is Central Park on Park Ave (owner authorized)'),
  updated_at = now()
where event_id = 'winter-park-christmas-parade-2026' and lat is null and lng is null;

update wf_events set
  lat = 27.8831, lng = -82.80861,
  address = 'Florida Botanical Gardens, 12520 Ulmerton Road, Largo, FL 33774',
  verify_note = concat_ws(' | ', verify_note, '2026-10-08 location: official address from flbgfoundation.org, coordinates from Wikipedia (owner authorized)'),
  updated_at = now()
where event_id = 'holiday-lights-florida-botanical-2026' and lat is null and lng is null;

commit;

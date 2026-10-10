// lib/christmasDiscoveries2026.js: the verified Christmas 2026 registry.
//
// Christmas v3 (lead packet, 2026-10-09). Merged at READ time into the
// wf_events rows by app/api/events/christmas/route.js, the same way Fall merges
// its registries (mergeFallDiscoveryRows in lib/fallEventImage.js). No database
// write: the owner rule is no production DB mutation without his approval.
//
// Publication law:
//   * a row is here ONLY when its 2026 dates were read on the organizer's own
//     page (research/master.json confirmed_2026 = "confirmed", checked
//     2026-10-09). Everything else is listed in docs/christmas-2026-pending.md
//     with the reason, never published on last year's dates.
//   * every row carries its rail explicitly (christmas_rail); the name regex in
//     lib/christmasIntentRails.js is only a fallback for rows not mapped here.
//   * coordinates, in this order: the venue's wf_inventory row (SELECT, name +
//     city matched), the researcher's cited source, else the US Census 2023
//     Gazetteer internal point of the city, flagged approxLocation so the card
//     says "~". Never invented. coord_source says which.
//   * admission: is_free true only when the organizer says free; unknown stays
//     null and is never shown as free.
//   * no photo names, photo URLs or photo credits are stored here (PR #1697).
//
// Copy (card_hook, schedule_note) is plain language with no dashes.

export const CHRISTMAS_DISCOVERIES_2026 = Object.freeze([
  {"event_id": "holidays-at-disney-s-animal-kingdom-lake-buena-vista-2026", "event_name": "Holidays at Disney's Animal Kingdom", "christmas_rail": "theme-parks", "start_date": "2026-11-13", "end_date": "2027-01-06", "city": "Lake Buena Vista", "state": "FL", "venue": "Disney's Animal Kingdom", "place_id": "ChIJ_eH9PaOB3YgRuz8jIkYEODQ", "lat": 28.35744, "lng": -81.59058, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Arctic animal puppets roam Discovery Island, the Tree of Life gets a holiday projection show, and Santa's Holiday Grove is new this year.", "schedule_note": "Daily with park hours; Tree of Life holiday show after dark about every 10 minutes", "official_event_url": "https://disneyparksblog.com/wdw/holidays-at-disney-world-christmas-lights-deals-and-more/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 5, "tags": ["christmas"]},
  {"event_id": "dazzling-nights-orlando-2026", "event_name": "Dazzling Nights", "christmas_rail": "lights", "start_date": "2026-11-20", "end_date": "2027-01-03", "city": "Orlando", "state": "FL", "venue": "Harry P. Leu Gardens", "start_time": "17:30:00", "end_time": "21:00:00", "place_id": "ChIJCRCYGrx654gR3G9qoVbWlpY", "lat": 28.56777, "lng": -81.35725, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A walk through a 50 acre botanical garden lit up in themed zones, with live entertainment. Good for families who want a big light show at night.", "schedule_note": "Select nights, timed entry, online tickets only", "official_event_url": "https://www.leugardens.org/Events/Calendar-of-Events/Dazzling-Nights", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 11, "tags": ["christmas"]},
  {"event_id": "now-snowing-nightly-at-celebration-2026", "event_name": "Now Snowing Nightly at Celebration", "christmas_rail": "towns-markets", "start_date": "2026-11-28", "end_date": "2026-12-31", "city": "Celebration", "state": "FL", "venue": "Celebration Town Center", "place_id": null, "lat": 28.310344, "lng": -81.55106, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A small town lakeside center where artificial snow falls each evening, with a tree lighting and seasonal strolling.", "schedule_note": "Now Snowing Nightly Nov 28 to Dec 31, 2026; Tree Lighting Ceremony Nov 28 and 29, 5 PM to 9:30 PM", "official_event_url": "https://celebrationtowncenter.com/events", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 12, "tags": ["christmas"]},
  {"event_id": "light-up-mount-dora-2026", "event_name": "Light Up Mount Dora", "christmas_rail": "towns-markets", "start_date": "2026-11-21", "end_date": "2026-11-21", "city": "Mount Dora", "state": "FL", "venue": "Downtown Mount Dora", "start_time": "17:00:00", "end_time": null, "place_id": "ChIJGSMzu2Oi54gR-rlDDL6V3Qs", "lat": 28.80235, "lng": -81.64369, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "The town lights its lakeside parks and downtown with a drone show, fireworks and Santa. Easy to pair with dinner and a stroll.", "schedule_note": "Light Up Mount Dora single evening Nov 21; lights then stay up through the holidays", "official_event_url": "https://www.mountdora.com/annual-festivals/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 13, "tags": ["christmas"]},
  {"event_id": "tis-the-season-in-downtown-winter-garden-2026", "event_name": "'Tis the Season in Downtown Winter Garden", "christmas_rail": "towns-markets", "start_date": "2026-12-04", "end_date": "2027-01-03", "city": "Winter Garden", "state": "FL", "venue": "Historic Downtown Winter Garden", "place_id": "ChIJ_5y7TySD54gR7m1y1b24hNM", "lat": 28.56567, "lng": -81.58571, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "A decorated historic downtown with a free city light show at City Hall, a night market and a parade weekend. Walkable and easy for a relaxed evening.", "schedule_note": "Light Up Winter Garden Dec 4; A Merry Winter Garden Light Show 11 nights; Main Street Holiday Stroll Dec 3 to Jan 3", "official_event_url": "https://www.cwgdn.com/925/Tis-the-Season-2026-Event-Schedule", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 14, "tags": ["christmas"]},
  {"event_id": "winter-wonderland-longwood-2026", "event_name": "Winter Wonderland", "christmas_rail": "lights", "start_date": "2026-11-29", "end_date": "2026-12-25", "city": "Longwood", "state": "FL", "venue": "Wekiva Island", "place_id": null, "lat": 28.701396, "lng": -81.348389, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "A riverside holiday spot with a lit Christmas tree forest, nightly fake snow, Santa's Workshop and kid crafts. Cheap to enter and relaxed.", "schedule_note": "Nightly snow flurries and tree forest; Santa's Workshop Fri to Sun; ticketed add on events on select dates through Dec 21", "official_event_url": "https://wekivaisland.com/winter-wonderland/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 17, "tags": ["christmas"]},
  {"event_id": "asian-lantern-festival-at-central-florida-zoo-sanford-2026", "event_name": "Asian Lantern Festival at Central Florida Zoo", "christmas_rail": "lights", "start_date": "2026-11-13", "end_date": "2027-01-17", "city": "Sanford", "state": "FL", "venue": "Central Florida Zoo & Botanical Gardens", "start_time": "18:00:00", "end_time": null, "place_id": null, "lat": 28.789425, "lng": -81.275624, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "Large handmade style lanterns lit after dark around the zoo, a non Christmas but very seasonal glowing walk good for families.", "schedule_note": "Select nights Nov 13, 2026 to Jan 17, 2027. Sensory nights Dec 1, 2026 and Jan 12, 2027. Adults 21+ nights Dec 10, 2026 and Jan 5, 2027.", "official_event_url": "https://www.centralfloridazoo.org/events/asian-lantern-festival/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 18, "tags": ["christmas"]},
  {"event_id": "holiday-ho-ho-ho-down-orlando-2026", "event_name": "Holiday Ho, Ho, Ho Down", "christmas_rail": "theme-parks", "start_date": "2026-12-05", "end_date": "2026-12-20", "city": "Orlando", "state": "FL", "venue": "Gatorland", "place_id": "ChIJ9RHZGx6H3YgRnWVYIWsHNPM", "lat": 28.35565, "lng": -81.40221, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A quirky swamp themed Christmas day with Gator Claus photos, Krampus Croc and holiday crafts on top of the regular park.", "schedule_note": "Select days Dec 5, 6, 12, 13, 19, 20, 2026 (three weekends), subject to change", "official_event_url": "https://www.gatorland.com/plan-your-visit/events/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 20, "tags": ["christmas"]},
  {"event_id": "christmas-holiday-home-tour-at-stetson-mansion-deland-2026", "event_name": "Christmas Holiday Home Tour at Stetson Mansion", "christmas_rail": "shows-outings", "start_date": "2026-11-01", "end_date": "2027-01-17", "city": "DeLand", "state": "FL", "venue": "Stetson Mansion", "place_id": null, "lat": 29.022663, "lng": -81.286498, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "Over the top themed Christmas decor throughout a restored Gilded Age mansion, a heavily photographed holiday home tour.", "schedule_note": "Christmas tours Nov 1, 2026 to Jan 17, 2027; Ticket Tailor lists e.g. Sat Dec 26, 2026. Reservations required.", "official_event_url": "https://stetsonmansion.com/christmas-tours", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 21, "tags": ["christmas"]},
  {"event_id": "holidays-at-bok-tower-gardens-lake-wales-2026", "event_name": "Holidays at Bok Tower Gardens", "christmas_rail": "shows-outings", "start_date": "2026-12-04", "end_date": "2026-12-19", "city": "Lake Wales", "state": "FL", "venue": "Bok Tower Gardens", "place_id": "ChIJmToCpQ4J3YgRof6hhxcoTIM", "lat": 27.93727, "lng": -81.57738, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Historic gardens with poinsettias, a decorated El Retiro mansion and evening carillon holiday concerts. A calmer, more traditional holiday outing.", "schedule_note": "Holiday decor and daily carillon concerts, plus ticketed holiday concerts Dec 4 (terrace music), Dec 12 and Dec 19", "official_event_url": "https://boktowergardens.org/event/holidays-at-bok-tower-gardens/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 22, "tags": ["christmas"]},
  {"event_id": "surfing-santas-of-cocoa-beach-2026", "event_name": "Surfing Santas of Cocoa Beach", "christmas_rail": "boat-parades", "start_date": "2026-12-24", "end_date": "2026-12-24", "city": "Cocoa Beach", "state": "FL", "venue": "Coconuts on the Beach, end of Minutemen Causeway", "start_time": "07:30:00", "end_time": "12:00:00", "place_id": "ChIJ0wYVXRYd3ogR-Rwiu-rQx4M", "lat": 28.31822, "lng": -80.60828, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "Hundreds of surfers in Santa costumes hit the waves on Christmas Eve with music on the beach. A uniquely Florida way to start the holiday.", "schedule_note": "Single morning, Christmas Eve", "official_event_url": "https://surfingsantas.org/event/surfing-santas-of-cocoa-beach-main-event-2026/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 23, "tags": ["christmas"]},
  {"event_id": "winter-village-at-curtis-hixon-park-tampa-2026", "event_name": "Winter Village at Curtis Hixon Park", "christmas_rail": "towns-markets", "start_date": "2026-11-20", "end_date": "2027-01-03", "city": "Tampa", "state": "FL", "venue": "Curtis Hixon Waterfront Park", "place_id": "ChIJlRUlG4nEwogRJOgu0Hf2n54", "lat": 27.94892, "lng": -82.46165, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "A downtown riverfront holiday village with shops, cafes and an outdoor ice rink. Free to walk through, with paid skating.", "schedule_note": "Daily in the holiday window; Mon to Wed closed Nov 30 to Dec 20", "official_event_url": "https://wintervillagetampa.com/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 28, "tags": ["christmas"]},
  {"event_id": "winter-wonder-wharf-at-sparkman-wharf-tampa-2026", "event_name": "Winter Wonder Wharf at Sparkman Wharf", "christmas_rail": "lights", "start_date": "2026-11-12", "end_date": "2026-11-12", "city": "Tampa", "state": "FL", "venue": "Sparkman Wharf", "start_time": "17:00:00", "end_time": "21:00:00", "place_id": "ChIJD0N73GTFwogRuJTf5jAk5B8", "lat": 27.94333, "lng": -82.44766, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": null, "price_band": null, "card_hook": "A one night tree lighting at the waterfront food hall with snow and festive photo spots. Easy to combine with the Water Street celebration nearby.", "schedule_note": "One evening, tree lighting with snow", "official_event_url": "https://sparkmanwharf.com/winter-wonder-wharf/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 30, "tags": ["christmas"]},
  {"event_id": "season-spectacular-at-water-street-tampa-2026", "event_name": "Season Spectacular at Water Street Tampa", "christmas_rail": "lights", "start_date": "2026-11-12", "end_date": "2026-11-12", "city": "Tampa", "state": "FL", "venue": "Water Street Tampa", "start_time": "17:00:00", "end_time": "21:00:00", "place_id": "ChIJy66Xe53FwogRcpjZQHX4cCI", "lat": 27.94389, "lng": -82.45019, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": null, "price_band": null, "card_hook": "The neighborhood switches on thousands of lights with music, Santa sightings and storefront activities. Pair it with Winter Wonder Wharf nearby the same night.", "schedule_note": "One night neighborhood lighting", "official_event_url": "https://www.waterstreettampa.com/experience/season-spectacular?date=2026-11-12", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 31, "tags": ["christmas"]},
  {"event_id": "christmas-lane-plant-city-2026", "event_name": "Christmas Lane", "christmas_rail": "lights", "start_date": "2026-11-27", "end_date": "2026-12-24", "city": "Plant City", "state": "FL", "venue": "Florida Strawberry Festival Grounds, Charlie Grimes Family Ag Center", "place_id": null, "lat": 28.015355, "lng": -82.117805, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A walk through a very large light display with hundreds of decorated trees, rides and Santa. A classic Tampa Bay lights stop that runs for charity style tradition.", "schedule_note": "Thursday to Sunday from opening, open every night Dec 17 to 24", "official_event_url": "https://christmaslane.com/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 33, "tags": ["christmas"]},
  {"event_id": "tampa-bay-s-festival-of-lights-santa-s-village-dover-2026", "event_name": "Tampa Bay's Festival of Lights & Santa's Village", "christmas_rail": "lights", "start_date": "2026-11-26", "end_date": "2026-12-27", "city": "Dover", "state": "FL", "venue": "Hillsborough County Fairgrounds", "start_time": "18:00:00", "end_time": null, "place_id": "ChIJteWEw_Ut3YgRlcKNOT9E82U", "lat": 27.94012, "lng": -82.20287, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": null, "price_band": null, "card_hook": "A drive through light route of about two miles paired with a walkable Santa's Village with rides and food. Works for families who like the car as part of the show.", "schedule_note": "Thursday to Sunday weekends plus Dec 21 to 23, village runs most nights", "official_event_url": "https://www.hillsboroughcountyfair.com/p/sub-pages/fest-of-lights", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 34, "tags": ["christmas"]},
  {"event_id": "symphony-in-lights-kickoff-wesley-chapel-2026", "event_name": "Symphony in Lights Kickoff", "christmas_rail": "lights", "start_date": "2026-11-14", "end_date": "2026-11-14", "city": "Wesley Chapel", "state": "FL", "venue": "The Shops at Wiregrass", "start_time": "17:00:00", "end_time": "21:30:00", "place_id": "ChIJHWXmMdewwogRk8JI-PK3rS0", "lat": 28.18908, "lng": -82.34968, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": null, "price_band": null, "card_hook": "An outdoor shopping center lights its trees on kickoff night with a drone show, market and Santa, followed by a choreographed light display. Good casual night out.", "schedule_note": "Kickoff Saturday Nov 14 with Santa's arrival, drone show and holiday market; nightly light show dates not yet found", "official_event_url": "https://www.theshopsatwiregrass.com/event/42598-symphony-in-lights-kickoff-presented-by-adventhealth-wesley-chapel", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 35, "tags": ["christmas"]},
  {"event_id": "shopapalooza-festival-st-petersburg-2026", "event_name": "Shopapalooza Festival", "christmas_rail": "towns-markets", "start_date": "2026-11-28", "end_date": "2026-11-29", "city": "St. Petersburg", "state": "FL", "venue": "Vinoy Park", "start_time": "10:00:00", "end_time": "17:00:00", "place_id": "ChIJESS-JgvhwogRnfB1lK46okc", "lat": 27.7791, "lng": -82.62572, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "A free two day holiday shopping festival on the bayfront with local makers and entertainment, good for gifts and a stroll.", "schedule_note": "Saturday and Sunday the weekend after Thanksgiving", "official_event_url": "https://www.visitstpeteclearwater.com/node/1966", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 41, "tags": ["christmas"]},
  {"event_id": "merry-beach-market-holiday-festival-madeira-beach-2026", "event_name": "Merry Beach Market Holiday Festival", "christmas_rail": "towns-markets", "start_date": "2026-12-11", "end_date": "2026-12-12", "city": "Madeira Beach", "state": "FL", "venue": "ROC Park, Madeira Beach Recreation Complex", "start_time": "17:00:00", "end_time": "21:00:00", "place_id": null, "lat": 27.79556, "lng": -82.791566, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "A beachside holiday market with local vendors, Santa, tree lighting and a lighted boat parade view on Saturday. Free to enter.", "schedule_note": "Two days; Friday fireworks at 8 PM; Saturday lighted boat parade at 6 PM", "official_event_url": "https://pinellasbeacheschamber.org/merry-beach-market/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 42, "tags": ["christmas"]},
  {"event_id": "holidays-at-utc-sarasota-2026", "event_name": "Holidays at UTC", "christmas_rail": "towns-markets", "start_date": "2026-11-14", "end_date": "2027-01-03", "city": "Sarasota", "state": "FL", "venue": "University Town Center", "place_id": "ChIJHcu6u2BHw4gRDKuRC9sow20", "lat": 27.38446, "lng": -82.45263, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": null, "price_band": null, "card_hook": "A shopping center that turns into a holiday setting with a kickoff parade, decor and a seasonal skating rink, handy for a casual evening out.", "schedule_note": "Season Nov 14 to Jan 3; Santa's Grand Arrival Parade Sat Nov 14, 2026; ice skating at The West District Nov 24 to Jan 1", "official_event_url": "https://utcsarasota.com/holidays/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 47, "tags": ["christmas"]},
  {"event_id": "north-pole-express-parrish-2026", "event_name": "North Pole Express", "christmas_rail": "theme-parks", "start_date": "2026-11-27", "end_date": "2026-12-22", "city": "Parrish", "state": "FL", "venue": "Florida Railroad Museum", "start_time": "17:15:00", "end_time": null, "place_id": "ChIJ______8sw4gRMudh58gsGMU", "lat": 27.59013, "lng": -82.42348, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A short train ride to a North Pole camp with Santa, cookies and cocoa, a full evening for young children.", "schedule_note": "Select evenings: Nov 27 to 29, Dec 2 to 6, 9 to 13, 16 to 22", "official_event_url": "https://www.frrm.org/north-pole-express/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 49, "tags": ["christmas"]},
  {"event_id": "sarasota-holiday-boat-parade-2026", "event_name": "Sarasota Holiday Boat Parade", "christmas_rail": "boat-parades", "start_date": "2026-12-12", "end_date": "2026-12-12", "city": "Sarasota", "state": "FL", "venue": "Sarasota Bay", "place_id": "ChIJ7wa-IxRAw4gRnwt6LGL2yeM", "lat": 27.33105, "lng": -82.54498, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "Lighted boats cross Sarasota Bay in view of the downtown waterfront, an easy free outing with optional restaurant seating.", "schedule_note": "Single evening, Saturday Dec 12, 2026", "official_event_url": "https://suncoastcharitiesforchildren.org/holiday-boat-parade/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 50, "tags": ["christmas"]},
  {"event_id": "venice-christmas-boat-parade-2026", "event_name": "Venice Christmas Boat Parade", "christmas_rail": "boat-parades", "start_date": "2026-12-05", "end_date": "2026-12-05", "city": "Venice", "state": "FL", "venue": "Intracoastal Waterway, Venice", "start_time": "18:00:00", "end_time": null, "place_id": null, "lat": 27.116973, "lng": -82.41519, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A volunteer run parade along the Venice waterway with several public spots to watch from shore.", "schedule_note": "Saturday Dec 5, 2026, 6 PM, Intracoastal Waterway", "official_event_url": "https://www.venicechristmasboatparade.net/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 51, "tags": ["christmas"]},
  {"event_id": "holiday-night-of-lights-sarasota-2026", "event_name": "Holiday Night of Lights", "christmas_rail": "towns-markets", "start_date": "2026-12-04", "end_date": "2026-12-04", "city": "Sarasota", "state": "FL", "venue": "St. Armands Circle", "start_time": "17:30:00", "end_time": null, "place_id": "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8", "lat": 27.31839, "lng": -82.57728, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": true, "price_band": "free", "card_hook": "The official kickoff of the season on the Circle with a tree lighting and Santa, plus shops and restaurants.", "schedule_note": "Friday Dec 4, 2026, 48th annual: carol sing along, Santa arrival, 60 ft tree lighting", "official_event_url": "https://starmandscircleassoc.com/events-happenings", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 53, "tags": ["christmas"]},
  {"event_id": "wellen-wonderland-venice-2026", "event_name": "Wellen Wonderland", "christmas_rail": "towns-markets", "start_date": "2026-12-04", "end_date": "2026-12-04", "city": "Venice", "state": "FL", "venue": "Downtown Wellen Park", "place_id": "ChIJJQVMQuJXw4gRhD0CpEOETGo", "lat": 27.04625, "lng": -82.32722, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": null, "price_band": null, "card_hook": "A new town center holiday weekend with Santa, music, snow and a tree lighting.", "schedule_note": "Tree lighting Friday Dec 4, 2026; page also mentions Christmas village, snow, glow bike ride (Friday and Saturday)", "official_event_url": "https://wellenpark.com/wellen-wonderland/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 54, "tags": ["christmas"]},
  {"event_id": "christmas-walk-in-downtown-venice-2026", "event_name": "Christmas Walk in Downtown Venice", "christmas_rail": "towns-markets", "start_date": "2026-12-03", "end_date": "2026-12-03", "city": "Venice", "state": "FL", "venue": "Downtown Venice District", "start_time": "17:00:00", "end_time": "20:00:00", "place_id": null, "lat": 27.116973, "lng": -82.41519, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "An evening stroll past decorated storefronts and trees with shops open late.", "schedule_note": "Thursday Dec 3, 2026, extended shop hours, music, decorated trees. Mayor's Hometown Christmas tree lighting Nov 27, 5 to 7 PM at Centennial Park.", "official_event_url": "https://www.visitvenicefl.org/event/christmas-walk-2026/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 55, "tags": ["christmas"]},
  {"event_id": "deck-the-halls-sarasota-2026", "event_name": "Deck the Halls", "christmas_rail": "shows-outings", "start_date": "2026-11-28", "end_date": "2026-12-24", "city": "Sarasota", "state": "FL", "venue": "Florida Studio Theatre, Keating Theatre", "start_time": "10:00:00", "end_time": null, "place_id": "ChIJrYGdKBJAw4gRafewzUWWYnk", "lat": 27.33678, "lng": -82.54532, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A short Florida themed holiday musical for kids with palm tree lights and sand snowmen, easy for small children.", "schedule_note": "Select weekends; listed shows Nov 28, 29, Dec 5, 6, 12, 20, 24 (mornings, some noon)", "official_event_url": "https://www.floridastudiotheatre.org/events-and-tickets/childrens-theatre-2026-27/deck-the-halls", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 56, "tags": ["christmas"]},
  {"event_id": "fifth-avenue-south-christmas-walk-naples-2026", "event_name": "Fifth Avenue South Christmas Walk", "christmas_rail": "towns-markets", "start_date": "2026-12-04", "end_date": "2026-12-05", "city": "Naples", "state": "FL", "venue": "5th Avenue South, Sugden Plaza", "place_id": null, "lat": 26.150485, "lng": -81.795299, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "Naples' biggest Christmas weekend with a tree lighting, living nativity, skating rink and avenue dining.", "schedule_note": "Fri Dec 4 5 to 10 PM with tree lighting about 6 PM; Sat Dec 5 10 AM 10 PM Christmas market", "official_event_url": "https://www.fifthavenuesouth.com/christmas/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 60, "tags": ["christmas"]},
  {"event_id": "festival-of-lights-at-fishermen-s-village-punta-gorda-2026", "event_name": "Festival of Lights at Fishermen's Village", "christmas_rail": "lights", "start_date": "2026-11-15", "end_date": "2026-12-31", "city": "Punta Gorda", "state": "FL", "venue": "Fishermen's Village", "place_id": null, "lat": 26.897754, "lng": -82.065812, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A waterfront shopping village decorated with lights nightly, with canal cruises as an add on.", "schedule_note": "Holiday Lighting of the Village Nov 14; Festival of Lights Nov 15 to Dec 31; Lighted Canal Cruises Dec 1 to 31; Christian Holiday Concert Dec 20", "official_event_url": "https://www.fishermensvillage.com/events", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 61, "tags": ["christmas"]},
  {"event_id": "christmas-boat-parade-on-naples-bay-2026", "event_name": "Christmas Boat Parade on Naples Bay", "christmas_rail": "boat-parades", "start_date": "2026-12-19", "end_date": "2026-12-19", "city": "Naples", "state": "FL", "venue": "Naples Bay", "start_time": "18:15:00", "end_time": "20:30:00", "place_id": null, "lat": 26.150485, "lng": -81.795299, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "Decorated boats pass Naples Bay with several free shore viewing spots.", "schedule_note": "Saturday Dec 19, 2026 per organizer MIACC", "official_event_url": "https://www.miacc.org/event/christmas-boat-parade-on-naples-bay/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 64, "tags": ["christmas"]},
  {"event_id": "sanibel-luminary-holiday-stroll-2026", "event_name": "Sanibel Luminary Holiday Stroll", "christmas_rail": "towns-markets", "start_date": "2026-12-04", "end_date": "2026-12-05", "city": "Sanibel", "state": "FL", "venue": "Sanibel", "start_time": "17:30:00", "end_time": "21:00:00", "place_id": null, "lat": 26.451038, "lng": -82.105676, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "Candle lined paths lead to decorated island shops, with Santa and live music, the 40th year.", "schedule_note": "Sanibel Fri Dec 4, 5:30 to 9 PM; Captiva Sat Dec 5", "official_event_url": "https://sanibel-island.sanibel-captiva.org/events/details/sanibel-luminary-holiday-stroll-2026-54681", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 65, "tags": ["christmas"]},
  {"event_id": "zoo-lights-at-zoo-miami-2026", "event_name": "Zoo Lights at Zoo Miami", "christmas_rail": "lights", "start_date": "2026-11-27", "end_date": "2026-12-30", "city": "Miami", "state": "FL", "venue": "Zoo Miami", "start_time": "18:30:00", "end_time": "22:00:00", "place_id": "ChIJFY7wCsjD2YgRn8R_2IMRjtw", "lat": 25.60953, "lng": -80.39641, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Over a million lights across the zoo grounds with a tree lighting, Santa and a train ride; select nights only.", "schedule_note": "Nov 27, 28; Dec 4, 5, 11, 12, 18 to 23, 26 to 30", "official_event_url": "https://www.zoomiami.org/zoo-lights", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 68, "tags": ["christmas"]},
  {"event_id": "historic-holiday-decor-at-deering-estate-palmetto-bay-2026", "event_name": "Historic Holiday Decor at Deering Estate", "christmas_rail": "shows-outings", "start_date": "2026-11-27", "end_date": "2027-01-06", "city": "Palmetto Bay", "state": "FL", "venue": "Deering Estate", "start_time": "10:00:00", "end_time": "16:00:00", "place_id": "ChIJz5n5t9jF2YgRjza5I32Cz3w", "lat": 25.61431, "lng": -80.3087, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A historic bayfront estate decorated for the season, with Santa days and evening campfire tours layered on top for those who want more.", "schedule_note": "Daily display Nov 27, 2026 to Jan 6, 2027; related add ons: Santa story time and Holiday by the Bay Dec 5, twilight Holiday House Tour and Campfire Dec 8, 16, 22, Holiday Bay Cruise Dec 13 (separate ticket, $65)", "official_event_url": "https://deeringestate.org/event/historic-holiday-decor/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 69, "tags": ["christmas"]},
  {"event_id": "christmas-wonderland-miami-2026", "event_name": "Christmas Wonderland Miami", "christmas_rail": "theme-parks", "start_date": "2026-11-13", "end_date": "2027-01-04", "city": "Miami", "state": "FL", "venue": "Tropical Park", "place_id": "ChIJcxJRMYe42YgRDSlj6Z_CDxk", "lat": 25.72605, "lng": -80.3244, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A carnival style Christmas park with unlimited rides, photo spots and free shows in Tropical Park.", "schedule_note": "Nov 13 to Jan 4; closed Mondays Nov 16, Nov 30, Dec 7; open Thanksgiving, Dec 24, 25, Dec 31, Jan 1 (FAQ, may be last year)", "official_event_url": "https://miamiwonderland.com/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 70, "tags": ["christmas"]},
  {"event_id": "winter-wonderland-at-flamingo-gardens-davie-2026", "event_name": "Winter Wonderland at Flamingo Gardens", "christmas_rail": "lights", "start_date": "2026-11-21", "end_date": "2026-12-30", "city": "Davie", "state": "FL", "venue": "Flamingo Gardens", "place_id": "ChIJrRCdX5en2YgRJzCRjgTWb-A", "lat": 26.07424, "lng": -80.31333, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A walk through a wildlife garden with lights, Santa's village, nightly music and s'mores.", "schedule_note": "Nov 21 through Dec 30, 2026 (homepage); detailed schedule page still shows 2025", "official_event_url": "https://flamingogardens.org/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 72, "tags": ["christmas"]},
  {"event_id": "holiday-magic-at-bonnet-house-fort-lauderdale-2026", "event_name": "Holiday Magic at Bonnet House", "christmas_rail": "shows-outings", "start_date": "2026-12-03", "end_date": "2026-12-10", "city": "Fort Lauderdale", "state": "FL", "venue": "Bonnet House Museum & Gardens", "start_time": "18:00:00", "end_time": null, "place_id": "ChIJOzaIz9AB2YgRJozqXFy4BIw", "lat": 26.13637, "lng": -80.10692, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A historic estate with illuminated trees, live music and Santa, offered on three December evenings.", "schedule_note": "Dec 3 concert, Dec 5 Whimsical Wonderland family evening (5:30 to 7:30 PM), Dec 10 choir", "official_event_url": "https://www.bonnethouse.org/holiday-magic/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 74, "tags": ["christmas"]},
  {"event_id": "zoo-lights-at-palm-beach-zoo-west-palm-beach-2026", "event_name": "Zoo Lights at Palm Beach Zoo", "christmas_rail": "lights", "start_date": "2026-11-20", "end_date": "2027-01-03", "city": "West Palm Beach", "state": "FL", "venue": "Palm Beach Zoo", "place_id": "ChIJP7aCRLrX2IgRVLd7doYiJi0", "lat": 26.66695, "lng": -80.06924, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "A three part after hours light walk with Santa, polar projections and glowing paths, with adults only nights.", "schedule_note": "Nov 20, 2026 to Jan 3, 2027; some nights are 21+ only", "official_event_url": "https://www.palmbeachzoo.org/zoo-lights", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 76, "tags": ["christmas"]},
  {"event_id": "delray-beach-100-ft-christmas-tree-lighting-2026", "event_name": "Delray Beach 100 ft Christmas Tree Lighting", "christmas_rail": "towns-markets", "start_date": "2026-12-01", "end_date": "2026-12-01", "city": "Delray Beach", "state": "FL", "venue": "Old School Square", "start_time": "18:00:00", "end_time": "21:00:00", "place_id": null, "lat": 26.455903, "lng": -80.09042, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A 100 foot tree, street fair and walk in tree display in downtown Delray, the area's main tree lighting.", "schedule_note": "Tuesday Dec 1, 2026, tree lit at 7 PM; tree and Santa's Holiday Village with skating and carousel in the following weeks", "official_event_url": "https://downtowndelraybeach.com/do/delrays-100-ft-christmas-tree-lighting", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 78, "tags": ["christmas"]},
  {"event_id": "key-west-harbor-walk-of-lights-2026", "event_name": "Key West Harbor Walk of Lights", "christmas_rail": "lights", "start_date": "2026-11-25", "end_date": "2026-12-31", "city": "Key West", "state": "FL", "venue": "Key West Historic Seaport", "place_id": null, "lat": 24.565063, "lng": -81.775539, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A waterfront stroll past a lighted Fishing Buoy tree and Lobster Trap tree, a distinctly Key West take on Christmas lights.", "schedule_note": "Lit every night from Thanksgiving Eve through New Year's Eve; free opening lighting Wed Nov 25 (Fishing Buoy tree 6 PM at Greene and Elizabeth, Lobster Trap tree 7 PM at Margaret St)", "official_event_url": "https://keywestchristmas.org", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 81, "tags": ["christmas"]},
  {"event_id": "holiday-makers-market-key-west-2026", "event_name": "Holiday Makers Market", "christmas_rail": "towns-markets", "start_date": "2026-11-28", "end_date": "2026-11-28", "city": "Key West", "state": "FL", "venue": "The Studios of Key West", "start_time": "10:00:00", "end_time": "15:00:00", "place_id": null, "lat": 24.565063, "lng": -81.775539, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "A one day local artist and maker market for handmade holiday gifts in downtown Key West.", "schedule_note": "Single day, Saturday Nov 28 (Small Business Saturday)", "official_event_url": "https://www.tskw.org/calendar/holidays-makers-market/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 84, "tags": ["christmas"]},
  {"event_id": "holiday-bazaar-key-west-2026", "event_name": "Holiday Bazaar", "christmas_rail": "towns-markets", "start_date": "2026-12-11", "end_date": "2026-12-11", "city": "Key West", "state": "FL", "venue": "Key West Museum of Art & History at the Custom House", "start_time": "17:00:00", "end_time": "20:00:00", "place_id": null, "lat": 24.565063, "lng": -81.775539, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "An evening bazaar and holiday concert on the Custom House porch, a small festive stop in old town Key West.", "schedule_note": "Single evening, Friday Dec 11, on the historic porch and street in front of the museum", "official_event_url": "https://www.kwahs.org/event/holiday-bazaar/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 85, "tags": ["christmas"]},
  {"event_id": "ritz-carlton-amelia-island-tree-lighting-fernandina-beach-2026", "event_name": "Ritz Carlton Amelia Island Tree Lighting", "christmas_rail": "shows-outings", "start_date": "2026-11-25", "end_date": "2026-11-25", "city": "Fernandina Beach", "state": "FL", "venue": "The Ritz Carlton, Amelia Island", "place_id": null, "lat": 30.65813, "lng": -81.45152, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "A resort tree lighting with Santa arriving by train and fireworks, with the ticket going to charity.", "schedule_note": "Single evening, Nov 25, 2026: 40 foot tree lighting, Santa arrival by train, live music, fireworks", "official_event_url": "https://www.ameliaisland.com/festivals-events/amelia-island-christmas/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 88, "tags": ["christmas"]},
  {"event_id": "deck-the-chairs-at-jacksonville-beach-2026", "event_name": "Deck the Chairs at Jacksonville Beach", "christmas_rail": "lights", "start_date": "2026-11-25", "end_date": "2027-01-01", "city": "Jacksonville Beach", "state": "FL", "venue": "Seawalk Pavilion and Latham Plaza", "start_time": "17:00:00", "end_time": null, "place_id": null, "lat": 30.272466, "lng": -81.385604, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "Dozens of decorated lifeguard chairs lit up along the beach with weekend student performances.", "schedule_note": "Nov 25, 2026 to Jan 1, 2027; Christmas Market Sundays Nov 29, Dec 6, 13, 20, 27", "official_event_url": "https://deckthechairs.org/jax-beach-deck-the-chairs/schedule-of-events/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 89, "tags": ["christmas"]},
  {"event_id": "gingerbread-extravaganza-in-springfield-jacksonville-2026", "event_name": "Gingerbread Extravaganza in Springfield", "christmas_rail": "shows-outings", "start_date": "2026-12-11", "end_date": "2026-12-27", "city": "Jacksonville", "state": "FL", "venue": "Historic Springfield Society", "start_time": "11:00:00", "end_time": "16:00:00", "place_id": null, "lat": 30.336864, "lng": -81.661603, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "A big gingerbread house exhibit in a historic neighborhood with a kids day and a candlelit evening.", "schedule_note": "Dec 11 to 27, most days; Holiday Home Tour Dec 11 to 12 5 to 9 PM; Gingerbread by Candlelight Dec 17; Kids Day Dec 19", "official_event_url": "https://historicspringfield.org/holidays-1/Gingerbread-Extraveganza", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 92, "tags": ["christmas"]},
  {"event_id": "pensacola-winterfest-2026", "event_name": "Pensacola Winterfest", "christmas_rail": "towns-markets", "start_date": "2026-11-22", "end_date": "2026-12-24", "city": "Pensacola", "state": "FL", "venue": "Downtown Pensacola", "start_time": "17:30:00", "end_time": null, "place_id": null, "lat": 30.4075, "lng": -87.21389, "coord_source": "https://en.wikipedia.org/wiki/Plaza_Ferdinand_VII", "is_free": null, "price_band": null, "card_hook": "A downtown Christmas town with trolley and character tours, snow displays and a lit Palafox Street.", "schedule_note": "Nov 22; Nov 27 to 29; Dec 4 to 6; Dec 11; Dec 13; Dec 18 to 20; Dec 21 to 24, 2026. Opens Black Friday Nov 27 with Elf Parade (2 PM), evening tours 5:30 PM", "official_event_url": "https://www.visitpensacola.com/events/pensacola-winterfest/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 94, "tags": ["christmas"]},
  {"event_id": "holiday-nights-at-baytowne-wharf-miramar-beach-2026", "event_name": "Holiday Nights at Baytowne Wharf", "christmas_rail": "towns-markets", "start_date": "2026-12-01", "end_date": "2026-12-31", "city": "Miramar Beach", "state": "FL", "venue": "Village of Baytowne Wharf", "place_id": null, "lat": 30.384881, "lng": -86.343631, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "A resort village with nightly tree light shows and weekly Santa visits, all free to attend.", "schedule_note": "Nights of Lights Dec 1 to 31 (6, 7, 8 PM); Lantern Parade Dec 5 5 PM; Wednesday concerts with Santa Dec 2, 9, 16 6 to 8 PM; Tuba Christmas Dec 12 5 to 7 PM; Grinchmas Dec 11 to 18 5 to 7 PM", "official_event_url": "https://baytownewharf.com/what_to_do.php?month=12", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 97, "tags": ["christmas"]},
  {"event_id": "beach-home-for-the-holidays-panama-city-beach-2026", "event_name": "Beach Home for the Holidays", "christmas_rail": "towns-markets", "start_date": "2026-11-27", "end_date": "2026-11-28", "city": "Panama City Beach", "state": "FL", "venue": "Aaron Bessant Park", "place_id": null, "lat": 30.233151, "lng": -85.877116, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A beachside kickoff with a tree lighting, Santa, concerts and fireworks on Thanksgiving weekend.", "schedule_note": "Thanksgiving weekend, Nov 27 and 28, 2026; schedule coming soon", "official_event_url": "https://www.visitpanamacitybeach.com/events/holiday-events/beach-home-for-the-holidays/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": 98, "tags": ["christmas"]},
  {"event_id": "key-west-lighted-boat-parade-2026", "event_name": "Key West Lighted Boat Parade", "christmas_rail": "boat-parades", "start_date": "2026-12-12", "end_date": "2026-12-12", "city": "Key West", "state": "FL", "venue": "Key West Historic Seaport Harbor Walk", "start_time": "18:00:00", "end_time": null, "place_id": null, "lat": 24.565063, "lng": -81.775539, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "A free lighted boat parade passing close to the Harbor Walk, easy to watch from the public seawall.", "schedule_note": "Single evening Saturday Dec 12, 2026", "official_event_url": "https://keywestchristmas.org", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "fernandina-lighted-christmas-parade-fernandina-beach-2026", "event_name": "Fernandina Lighted Christmas Parade", "christmas_rail": "parades", "start_date": "2026-12-05", "end_date": "2026-12-05", "city": "Fernandina Beach", "state": "FL", "venue": "Historic Downtown Fernandina Beach", "place_id": null, "lat": 30.65813, "lng": -81.45152, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": true, "price_band": "free", "card_hook": "A small town lighted parade on the first Saturday of December.", "schedule_note": "Saturday Dec 5, 2026", "official_event_url": "https://www.ameliaisland.com/festivals-events/amelia-island-christmas/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "city-of-naples-christmas-parade-2026", "event_name": "City of Naples Christmas Parade", "christmas_rail": "parades", "start_date": "2026-12-08", "end_date": "2026-12-08", "city": "Naples", "state": "FL", "venue": "Downtown Naples, 3rd St S and 9th Ave S to City Hall", "start_time": "18:30:00", "end_time": "20:00:00", "place_id": null, "lat": 26.150485, "lng": -81.795299, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "Evening parade through the older downtown blocks of Naples, ending at City Hall, with lighted floats on a weeknight.", "schedule_note": "Single date, Tuesday Dec 8, 2026", "official_event_url": "https://www.naplesgov.com/parksrec/page/2026-city-naples-christmas-parade", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "st-augustine-christmas-parade-2026", "event_name": "St. Augustine Christmas Parade", "christmas_rail": "parades", "start_date": "2026-12-05", "end_date": "2026-12-05", "city": "St. Augustine", "state": "FL", "venue": "Mission Nombre de Dios to Visitor Information Center, historic downtown", "start_time": "09:00:00", "end_time": "10:30:00", "place_id": null, "lat": 29.892488, "lng": -81.311994, "coord_source": "https://visitstaugustine.com/venue/plaza de la constitucion (Plaza de la Constitucion, near the route and the post parade Santa photos; official viewing spots are San Marco Ave west side, Cathedral Place, Cordova St)", "is_free": true, "price_band": "free", "card_hook": "A free morning parade through the oldest part of the city, starting at the Mission and ending behind the Visitor Information Center, with Santa photos at the Plaza afterward.", "schedule_note": "Single date, Saturday Dec 5, 2026", "official_event_url": "https://www.visitstaugustine.com/event/christmas-parade", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "daytona-beach-christmas-parade-2026", "event_name": "Daytona Beach Christmas Parade", "christmas_rail": "parades", "start_date": "2026-12-05", "end_date": "2026-12-05", "city": "Daytona Beach", "state": "FL", "venue": "Beach Street, downtown Daytona Beach", "start_time": "18:00:00", "end_time": null, "place_id": null, "lat": 29.20944, "lng": -81.01667, "coord_source": "https://en.wikipedia.org/wiki/Jackie_Robinson_Ballpark (105 E Orange Ave at Beach St, downtown; near the south end of the route)", "is_free": null, "price_band": null, "card_hook": "An evening downtown parade along Beach Street with free public parking available nearby.", "schedule_note": "Single date, Saturday Dec 5, 2026", "official_event_url": "https://www.daytonabeach.gov/ChristmasParade", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "lakeland-christmas-parade-2026", "event_name": "Lakeland Christmas Parade", "christmas_rail": "parades", "start_date": "2026-12-03", "end_date": "2026-12-03", "city": "Lakeland", "state": "FL", "venue": "Downtown Lakeland, RP Funding Center via Lemon Street", "start_time": "19:00:00", "end_time": null, "place_id": null, "lat": 28.04417, "lng": -81.95167, "coord_source": "https://en.wikipedia.org/wiki/Lake_Mirror_(Lakeland) (Lake Mirror, downtown, site of the fireworks that open the event)", "is_free": null, "price_band": null, "card_hook": "A large long running weeknight parade through downtown with fireworks over Lake Mirror at the start.", "schedule_note": "Single date, Thursday Dec 3, 2026, fireworks over Lake Mirror at 7 PM", "official_event_url": "https://www.lakelandgov.net/departments/communications/christmas-parade/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "sanford-holiday-parade-of-lights-2026", "event_name": "Sanford Holiday Parade of Lights", "christmas_rail": "parades", "start_date": "2026-12-12", "end_date": "2026-12-12", "city": "Sanford", "state": "FL", "venue": "Downtown Sanford, 1st Street", "start_time": "18:00:00", "end_time": "20:00:00", "place_id": null, "lat": 28.789425, "lng": -81.275624, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "A lit up one mile evening parade through the brick streets of downtown Sanford on the lakefront.", "schedule_note": "Single date, Saturday Dec 12, 2026", "official_event_url": "https://sanfordfl.gov/?p=73202", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "ugly-sweater-pub-crawl-tampa-2026", "event_name": "Ugly Sweater Pub Crawl Tampa", "christmas_rail": "parties", "start_date": "2026-12-19", "end_date": "2026-12-19", "city": "Tampa", "state": "FL", "venue": "Anchor Tavern", "start_time": "16:30:00", "end_time": "21:00:00", "place_id": "ChIJS21014vEwogRXMNoxBIrzGg", "lat": 27.94889, "lng": -82.45889, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Walk between several bars in ugly sweaters with a wristband for drink specials.", "schedule_note": "Saturday Dec 19, 2026, check in anytime 4 to 9 PM", "official_event_url": "https://www.eventbrite.com/e/do-the-ugly-sweater-pub-crawl-in-tampa-tickets-1992177366130", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "ugly-sweater-pub-crawl-miami-2026", "event_name": "Ugly Sweater Pub Crawl Miami", "christmas_rail": "parties", "start_date": "2026-12-19", "end_date": "2026-12-19", "city": "Miami", "state": "FL", "venue": "The Auld Dubliner", "start_time": "16:30:00", "end_time": "21:00:00", "place_id": "ChIJQ9vJKdy32YgR2qzegZrOieQ", "lat": 25.77526, "lng": -80.19484, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Walk between several bars in ugly sweaters with a wristband for drink specials.", "schedule_note": "Saturday Dec 19, 2026, check in anytime 4 to 9 PM", "official_event_url": "https://www.eventbrite.com/e/do-the-ugly-sweater-pub-crawl-in-miami-tickets-1992177353091", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "ugly-sweater-pub-crawl-sarasota-2026", "event_name": "Ugly Sweater Pub Crawl Sarasota", "christmas_rail": "parties", "start_date": "2026-12-19", "end_date": "2026-12-19", "city": "Sarasota", "state": "FL", "venue": "Joe's On Main", "start_time": "16:30:00", "end_time": "21:00:00", "place_id": "ChIJB_VL5xJAw4gRY58y23x1wBw", "lat": 27.33634, "lng": -82.54162, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Walk between several bars in ugly sweaters with a wristband for drink specials.", "schedule_note": "Saturday Dec 19, 2026, check in anytime 4 to 9 PM", "official_event_url": "https://www.eventbrite.com/e/do-the-ugly-sweater-pub-crawl-in-sarasota-tickets-1992177359109", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "ugly-sweater-pub-crawl-tallahassee-2026", "event_name": "Ugly Sweater Pub Crawl Tallahassee", "christmas_rail": "parties", "start_date": "2026-12-19", "end_date": "2026-12-19", "city": "Tallahassee", "state": "FL", "venue": "Finnegan's Wake", "start_time": "16:30:00", "end_time": "21:00:00", "place_id": null, "lat": 30.453529, "lng": -84.252272, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "Walk between several bars in ugly sweaters with a wristband for drink specials.", "schedule_note": "Saturday Dec 19, 2026, check in anytime 4 to 9 PM", "official_event_url": "https://www.eventbrite.com/e/do-the-ugly-sweater-pub-crawl-in-tallahassee-tickets-1992177363121", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "st-petersburg-santacon-bar-crawl-2026", "event_name": "St. Petersburg SantaCon Bar Crawl", "christmas_rail": "parties", "start_date": "2026-12-12", "end_date": "2026-12-12", "city": "St. Petersburg", "state": "FL", "venue": "Check in venue at 242 1st Ave N", "start_time": "13:00:00", "end_time": "23:00:00", "place_id": null, "lat": 27.762727, "lng": -82.644131, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": false, "price_band": null, "card_hook": "Costumed Santa bar crawl across downtown St. Pete with drink specials.", "schedule_note": "Saturday Dec 12, 2026; check in 1 to 5 PM", "official_event_url": "https://www.eventbrite.com/e/st-petersburg-santacon-bar-crawl-2026-tickets-1988196289623", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "tampa-santa-brunch-cruise-2026", "event_name": "Tampa Santa Brunch Cruise", "christmas_rail": "parties", "start_date": "2026-12-13", "end_date": "2026-12-13", "city": "Tampa", "state": "FL", "venue": "Yacht StarShip", "start_time": "12:30:00", "end_time": "14:30:00", "place_id": "ChIJHxcB0vPEwogR3fFnuF_MWmg", "lat": 27.94221, "lng": -82.44821, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Two hour brunch cruise out of Channelside with Santa on board.", "schedule_note": "Sunday Dec 13, 2026, boards 12:00 PM", "official_event_url": "https://yachtstarship.com/event/tampa-santa-brunch-cruise/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "breakfast-with-santa-at-rainforest-cafe-lake-buena-vista-2026", "event_name": "Breakfast with Santa at Rainforest Cafe", "christmas_rail": "parties", "start_date": "2026-12-21", "end_date": "2026-12-23", "city": "Lake Buena Vista", "state": "FL", "venue": "Rainforest Cafe", "start_time": "09:00:00", "end_time": null, "place_id": "ChIJva4JdYl_3YgRONSoO7NXO_0", "lat": 28.37267, "lng": -81.51568, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Themed rainforest breakfast with Santa photos and letters.", "schedule_note": "Dec 21, 22, 23, 2026", "official_event_url": "https://www.eventbrite.com/e/rainforest-cafe-disney-springs-breakfast-with-santa-tickets-2000461039821", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "santa-s-workshop-brunch-at-galuppi-s-pompano-beach-2026", "event_name": "Santa's Workshop Brunch at Galuppi's", "christmas_rail": "parties", "start_date": "2026-12-06", "end_date": "2026-12-06", "city": "Pompano Beach", "state": "FL", "venue": "Galuppi's", "start_time": "10:00:00", "end_time": "12:30:00", "place_id": "ChIJxT5RpqEC2YgRAZR8LkMhskI", "lat": 26.2458, "lng": -80.10324, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Character brunch with Santa and crafts for kids north of Fort Lauderdale.", "schedule_note": "Sunday 2026 to 12 to 06", "official_event_url": "https://www.galuppis.com/kids-event/santas-workshop-brunch/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "polar-express-character-brunch-at-galuppi-s-pompano-beach-2026", "event_name": "Polar Express Character Brunch at Galuppi's", "christmas_rail": "parties", "start_date": "2026-12-13", "end_date": "2026-12-13", "city": "Pompano Beach", "state": "FL", "venue": "Galuppi's", "start_time": "10:00:00", "end_time": "12:30:00", "place_id": "ChIJxT5RpqEC2YgRAZR8LkMhskI", "lat": 26.2458, "lng": -80.10324, "coord_source": "wf_inventory venue row (SELECT 2026-10-09, name and city matched)", "is_free": false, "price_band": null, "card_hook": "Character brunch with Santa and crafts for kids north of Fort Lauderdale.", "schedule_note": "Sunday 2026 to 12 to 13", "official_event_url": "https://www.galuppis.com/kids-event/polar-express-character-brunch/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
  {"event_id": "manatee-river-holiday-boat-parade-bradenton-2026", "event_name": "Manatee River Holiday Boat Parade", "christmas_rail": "boat-parades", "start_date": "2026-12-12", "end_date": "2026-12-12", "city": "Bradenton", "state": "FL", "venue": "Manatee River, Bradenton", "place_id": null, "lat": 27.489798, "lng": -82.576804, "approxLocation": true, "coord_source": "US Census 2023 Gazetteer internal point for the city (approximate)", "is_free": null, "price_band": null, "card_hook": "The county's largest holiday event, a river parade of decorated boats watched from the downtown waterfront.", "schedule_note": "Save the date Saturday Dec 12, 2026", "official_event_url": "https://holidayboatparade.org/", "event_status": "scheduled", "source_tier": 2, "verification_confidence": "high", "checked_at": "2026-10-09", "research_n": null, "tags": ["christmas"]},
].map((row) => Object.freeze(row)));

// Corrections to EXISTING wf_events rows, applied at read time because the DB
// write could not be applied. The first five are owner authorized location
// corrections (public viewing spot, not staging); the times come from the
// lead's cross check of the official pages on 2026-10-09.
export const CHRISTMAS_EVENT_CORRECTIONS_2026 = Object.freeze({
  "cocoa-beach-holiday-boat-parade-2026": Object.freeze({
    short_title: "Cocoa Beach Holiday Boat Parade",
    lat: 28.3237323, lng: -80.6168073, place_id: null, venue: "Cove Park, 540 McNabb Pkwy",
    start_date: "2026-12-12", end_date: "2026-12-12", start_time: "18:00:00",
    schedule_note: "Saturday December 12, 2026 at 6 PM. Watch from Cove Park, 540 McNabb Pkwy; the parade starts at Marker 101 near Centennial Park on SR 520.",
  }),
  "fort-myers-beach-christmas-boat-parade-2026": Object.freeze({
    lat: 26.4584387, lng: -81.9534145, place_id: null, venue: "Matanzas Pass Fishing Pier, San Carlos Island",
    start_date: "2026-12-05", end_date: "2026-12-05", start_time: "18:00:00", end_time: "20:00:00",
    schedule_note: "Saturday December 5, 2026, 6 to 8 PM. Watch from the Matanzas Pass Fishing Pier on San Carlos Island.",
  }),
  "palm-beach-holiday-boat-parade-2026": Object.freeze({
    lat: 26.8742123, lng: -80.065773, place_id: null, venue: "Bert Winters Park, 13425 Ellison Wilson Rd, Juno Beach",
    start_date: "2026-12-05", end_date: "2026-12-05", start_time: "18:00:00",
    schedule_note: "Saturday December 5, 2026 from 6 PM. Watch from Bert Winters Park, 13425 Ellison Wilson Rd, Juno Beach.",
  }),
  "winter-park-christmas-parade-2026": Object.freeze({
    lat: 28.5978454, lng: -81.3514572, place_id: null, venue: "Central Park on Park Avenue",
    start_date: "2026-12-05", end_date: "2026-12-05", start_time: "09:00:00", end_time: "10:30:00",
    schedule_note: "Saturday December 5, 2026, 9 to 10:30 AM. The route runs along Park Avenue from Cole Ave to Lyman Ave.",
  }),
  "holiday-lights-florida-botanical-2026": Object.freeze({
    lat: 27.8831, lng: -82.80861, place_id: null, venue: "Florida Botanical Gardens, 12520 Ulmerton Rd, Largo",
    start_date: "2026-11-27", end_date: "2027-01-02", start_time: "17:30:00", end_time: "21:30:00",
  }),
  // Lead cross check, 2026-10-09 (official pages).
  "selby-lights-in-bloom-2026": Object.freeze({ start_date: "2026-12-05", end_date: "2027-01-02", start_time: "17:30:00", end_time: "21:00:00" }),
  "pinecrest-nights-of-lights-2026": Object.freeze({ start_date: "2026-12-04", end_date: "2026-12-23", start_time: "18:30:00", end_time: "22:00:00" }),
  "holiday-fantasy-of-lights-2026": Object.freeze({ start_date: "2026-11-21", end_date: "2027-01-02", start_time: "18:00:00", end_time: "22:00:00" }),
  "christmas-on-third-naples-2026": Object.freeze({ start_date: "2026-11-23", end_date: "2026-11-23", start_time: "18:00:00", end_time: "21:00:00" }),
  "islamorada-holiday-festival-2026": Object.freeze({ start_date: "2026-12-04", end_date: "2026-12-04", start_time: "16:00:00", end_time: "22:00:00", venue: "Founders Park" }),
});

// Explicit rail for every EXISTING wf_events Christmas row (verified by earlier
// lanes on official pages). Researched rows use the researcher's rail.
export const CHRISTMAS_EVENT_RAIL = Object.freeze({
  // lights
  "holiday-lights-florida-botanical-2026": "lights",
  "holiday-lights-in-largo-central-park-2026": "lights",
  "selby-lights-in-bloom-2026": "lights",
  "edison-and-ford-holiday-nights-2026": "lights",
  "naples-night-lights-2026": "lights",
  "pinecrest-nights-of-lights-2026": "lights",
  "holiday-fantasy-of-lights-2026": "lights",
  "nights-of-lights-2026": "lights",
  "stephen-foster-festival-of-lights-2026": "lights",
  "suwannee-lights-2026": "lights",
  "the-wonderland-of-lights-2026": "lights",
  "lights-4-hope-drive-thru-light-show-2026": "lights",
  "enchant-stpete-2026": "lights",
  "zootampa-christmas-wild-2026": "lights",
  "christmas-at-gaylord-palms-2026": "lights",
  // towns, markets and festive walks
  "winter-on-the-avenue-2026": "towns-markets",
  "christmas-on-third-naples-2026": "towns-markets",
  "holiday-in-paradise-tree-lighting-2026": "towns-markets",
  "islamorada-holiday-festival-2026": "towns-markets",
  "dickens-on-centre-2026": "towns-markets",
  "light-up-the-holidays-2026": "towns-markets",
  "art-and-craft-holiday-bazaar-2026": "towns-markets",
  "christmas-on-las-olas-2026": "towns-markets",
  "winterfest-family-fun-day-2026": "towns-markets",
  "christmas-on-walnut-street-2026": "towns-markets",
  "christmas-made-in-the-south-2026": "towns-markets",
  "christmas-on-the-square-2026": "towns-markets",
  "tree-lighting-2026": "towns-markets",
  "santa-drop-at-the-flora-bama-2026": "towns-markets",
  "old-florida-holiday-and-winter-market-2026": "towns-markets",
  "theres-snow-place-like-tarpon-springs-2026": "towns-markets",
  "lake-sumter-landing-holly-jolly-arts-and-crafts-festival-2026": "towns-markets",
  "whimsy-market-holiday-market-2026": "towns-markets",
  "holiday-shopping-fair-at-south-florida-fairgrounds-2026": "towns-markets",
  "santas-wonderland-festival-2026": "towns-markets",
  "haven-holiday-market-2026": "towns-markets",
  "festival-of-lights-2026": "towns-markets",
  // theme parks, snow, trains and Santa
  "epcot-festival-holidays-2026": "theme-parks",
  "universal-orlando-holidays-2026": "theme-parks",
  "seaworld-orlando-christmas-2026": "theme-parks",
  "legoland-fl-holidays-2026": "theme-parks",
  "christmas-town-2026": "theme-parks",
  // boat parades and coastal traditions
  "cocoa-beach-holiday-boat-parade-2026": "boat-parades",
  "fort-myers-beach-christmas-boat-parade-2026": "boat-parades",
  "winterfest-boat-parade-2026": "boat-parades",
  "palm-beach-holiday-boat-parade-2026": "boat-parades",
  "jacksonville-light-boat-parade-2026": "boat-parades",
  "tampa-riverwalk-boat-parade-2026": "boat-parades",
  "boca-ciega-yacht-club-lighted-christmas-boat-parade-2026": "boat-parades",
  "clearwater-holiday-lighted-boat-parade-2026": "boat-parades",
  "treasure-island-holiday-lighted-boat-parade-2026": "boat-parades",
  "boat-parade-of-lights-2026": "boat-parades",
  // parades
  "winter-park-christmas-parade-2026": "parades",
  "winter-festival-a-celebration-of-lights-music-and-the-arts-2026": "parades",
  "sarasota-holiday-parade-2026": "parades",
  "kissimmee-festival-of-lights-parade-2026": "parades",
  "chiefland-christmas-festival-and-parade-2026": "parades",
  "christmas-festival-and-parade-2026": "parades",
  "leesburg-christmas-festival-and-parade-2026": "parades",
  "sights-and-sounds-on-second-christmas-parade-2026": "parades",
  // shows, historic homes and holiday outings
  "festival-of-trees-omart-2026": "shows-outings",
  // the park after hours parties are separately ticketed park nights: theme parks (lead, 2026-10-09)
  "mvmcp-2026": "theme-parks",
  "jollywood-nights-2026": "theme-parks",
});

// ── Exceptional: the statewide headliners (lead decision, 2026-10-09) ───────
// Owner brief: "put EXCEPTIONAL distant options in a clearly labeled day trip
// group". Only these may appear in a rail's Day trip group (over 90 mi); every
// other item shows only within 90 mi. Theme park events are all exceptional.
export const CHRISTMAS_EXCEPTIONAL_IDS = Object.freeze([
  // theme parks
  "mvmcp-2026", "epcot-festival-holidays-2026", "jollywood-nights-2026", "universal-orlando-holidays-2026",
  "seaworld-orlando-christmas-2026", "christmas-town-2026", "legoland-fl-holidays-2026",
  "holidays-at-disney-s-animal-kingdom-lake-buena-vista-2026", "north-pole-express-parrish-2026",
  // lights
  "nights-of-lights-2026", "christmas-at-gaylord-palms-2026", "selby-lights-in-bloom-2026", "naples-night-lights-2026",
  "edison-and-ford-holiday-nights-2026", "dazzling-nights-orlando-2026", "enchant-stpete-2026", "key-west-harbor-walk-of-lights-2026",
  "holiday-fantasy-of-lights-2026", "zoo-lights-at-zoo-miami-2026", "zoo-lights-at-palm-beach-zoo-west-palm-beach-2026",
  "suwannee-lights-2026", "stephen-foster-festival-of-lights-2026",
  // towns, markets and festive walks
  "dickens-on-centre-2026", "pensacola-winterfest-2026", "now-snowing-nightly-at-celebration-2026", "delray-beach-100-ft-christmas-tree-lighting-2026",
  // boat parades
  "winterfest-boat-parade-2026", "tampa-riverwalk-boat-parade-2026",
  // shows and historic homes
  "christmas-holiday-home-tour-at-stetson-mansion-deland-2026",
]);
const EXCEPTIONAL = new Set(CHRISTMAS_EXCEPTIONAL_IDS);

// ── Pop up bars (21+) ───────────────────────────────────────────────────────
// The Miracle and Sippin' Santa 2026 location lists are published, per bar
// dates are not. Each bar is a PLACE card (the bar itself, one card per
// destination) that says exactly that, never a date. Only bars whose venue is
// an exact wf_inventory match are here; the rest are pending.
export const CHRISTMAS_POPUP_SEASON_LINE = "2026 season confirmed, opening date not announced yet.";
// The card says the line in two parts so neither is clipped on a phone: a
// chip ("2026 season confirmed") and the take ("Opening date not announced yet.").
export const CHRISTMAS_POPUP_SEASON_CHIP = "2026 season confirmed";
export const CHRISTMAS_POPUP_DATE_LINE = "Opening date not announced yet.";
// The season's last night for hiding the cards (the pop ups close by New Year).
export const CHRISTMAS_POPUP_SEASON_THROUGH = "2026-12-31";
export const CHRISTMAS_POPUP_BARS_2026 = Object.freeze({
  "ChIJi2PkeXZBw4gRLZVjT4APW88": Object.freeze({ brand: "Miracle", title: "Miracle at Tamiami Tap", source: "https://www.miraclepopup.com/locations-2026" }), // Sarasota
  "ChIJQwikKNrjwogR734UinU6wVs": Object.freeze({ brand: "Miracle", title: "Miracle at Bar Mezzo", source: "https://www.miraclepopup.com/locations-2026" }), // St. Petersburg
  "ChIJu5KCkJYn5IgRVVjGR-aX2N4": Object.freeze({ brand: "Miracle", title: "Miracle at Forgotten Tonic", source: "https://www.miraclepopup.com/locations-2026" }), // St. Augustine
  "ChIJDahUeGJ654gRTbXyn3JDd0U": Object.freeze({ brand: "Miracle", title: "Miracle at The Courtesy", source: "https://www.miraclepopup.com/locations-2026" }), // Winter Park
  "ChIJ1zIbt3sB2YgR_8jyaGTRxJg": Object.freeze({ brand: "Miracle", title: "Miracle at The Shorely", source: "https://www.miraclepopup.com/locations-2026" }), // Fort Lauderdale
  "ChIJC2p8EbKj6IgRKUUx8t8-8L0": Object.freeze({ brand: "Miracle", title: "Miracle at Cry Baby's", source: "https://www.miraclepopup.com/locations-2026" }), // Gainesville
  "ChIJ24y7SQsT3YgR57bNmVn0Aqc": Object.freeze({ brand: "Miracle", title: "Miracle at Sauvage", source: "https://www.miraclepopup.com/locations-2026" }), // Winter Haven
  "ChIJ3yybHX3f2IgR63BD308M-Ko": Object.freeze({ brand: "Sippin' Santa", title: "Sippin' Santa at Second Rodeo", source: "https://www.sippinsantapopup.com/locations-2026" }), // Boynton Beach
  "ChIJdRWXR0Qp54gR013YFmrkVMA": Object.freeze({ brand: "Sippin' Santa", title: "Sippin' Santa at Outriggers", source: "https://www.sippinsantapopup.com/locations-2026" }), // New Smyrna Beach
});

// PURE. wf_events rows + registry rows -> one row per event_id. A registry row
// with the same id as a DB row is laid over it (identity and copy), and the
// corrections are applied last. A DB row is never duplicated.
export function mergeChristmasDiscoveryRows(databaseRows, discoveries = CHRISTMAS_DISCOVERIES_2026, corrections = CHRISTMAS_EVENT_CORRECTIONS_2026) {
  const dbRows = Array.isArray(databaseRows) ? databaseRows.filter(Boolean) : [];
  const sourceRows = Array.isArray(discoveries) ? discoveries.filter((row) => row?.event_id) : [];
  const dbById = new Map(dbRows.filter((row) => row.event_id).map((row) => [row.event_id, row]));
  const sourceIds = new Set(sourceRows.map((row) => row.event_id));
  const merged = [
    ...dbRows.filter((row) => !sourceIds.has(row.event_id)),
    ...sourceRows.map((source) => (dbById.has(source.event_id) ? { ...dbById.get(source.event_id), ...source } : { ...source })),
  ];
  return merged.map((row) => {
    const fix = corrections && corrections[row.event_id];
    const rail = row.christmas_rail || CHRISTMAS_EVENT_RAIL[row.event_id] || null;
    const out = fix ? { ...row, ...fix } : { ...row };
    if (rail) out.christmas_rail = rail;
    if (EXCEPTIONAL.has(row.event_id)) out.exceptional = true;
    return out;
  });
}

// ── City points (last rung for a row with no venue coordinates) ─────────────
// US Census Bureau 2023 Gazetteer, Florida places, INTPTLAT/INTPTLONG (the
// Census internal point of each incorporated place or CDP), downloaded
// 2026-10-09 from www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/.
// Used only on an exact Florida city name match, after lib/landingCities.js,
// and always flagged approxLocation so the card shows "~". Approved as the
// approximate placement source by the lead, 2026-10-09.
export const CHRISTMAS_CITY_POINTS = Object.freeze({
  "Altamonte Springs": [28.661022, -81.394681],
  "Apalachicola": [29.727426, -84.994047],
  "Auburndale": [28.109997, -81.797322],
  "Bartow": [27.886803, -81.821758],
  "Boca Raton": [26.37269, -80.103711],
  "Bonita Springs": [26.355011, -81.784234],
  "Boynton Beach": [26.528334, -80.080722],
  "Bradenton": [27.489798, -82.576804],
  "Brandon": [27.935985, -82.299255],
  "Brooksville": [28.516578, -82.404665],
  "Cape Coral": [26.643192, -81.997364],
  "Casselberry": [28.661183, -81.321926],
  "Cedar Key": [29.150265, -83.037362],
  "Celebration": [28.310344, -81.55106],
  "Chiefland": [29.492246, -82.866334],
  "Clearwater": [27.979419, -82.771256],
  "Clermont": [28.533292, -81.720238],
  "Clewiston": [26.752811, -80.939194],
  "Cocoa": [28.376643, -80.763306],
  "Cocoa Beach": [28.32914, -80.627539],
  "Coconut Creek": [26.280943, -80.184718],
  "Coral Gables": [25.683061, -80.261659],
  "Crestview": [30.747932, -86.579275],
  "Crystal River": [28.895504, -82.60187],
  "Dade City": [28.355933, -82.193437],
  "Davie": [26.079169, -80.283013],
  "Daytona Beach": [29.19071, -81.097083],
  "DeLand": [29.022663, -81.286498],
  "Delray Beach": [26.455903, -80.09042],
  "Doral": [25.815956, -80.357556],
  "Dover": [27.986821, -82.231146],
  "Dunedin": [28.025744, -82.815358],
  "Eustis": [28.857172, -81.676824],
  "Fernandina Beach": [30.65813, -81.45152],
  "Fort Lauderdale": [26.141227, -80.146731],
  "Fort Myers": [26.620074, -81.829547],
  "Fort Myers Beach": [26.430176, -81.91404],
  "Fort Pierce": [27.426112, -80.342488],
  "Fruitland Park": [28.849595, -81.936899],
  "Gainesville": [29.679537, -82.346793],
  "Green Cove Springs": [29.985312, -81.680979],
  "Gulfport": [27.746437, -82.709943],
  "Haines City": [28.112817, -81.616537],
  "Hernando": [28.954529, -82.393459],
  "Hollywood": [26.030967, -80.164609],
  "Homosassa": [28.784867, -82.607604],
  "Jacksonville": [30.336864, -81.661603],
  "Jacksonville Beach": [30.272466, -81.385604],
  "Jupiter": [26.918551, -80.11694],
  "Key West": [24.565063, -81.775539],
  "Kissimmee": [28.30278, -81.417831],
  "Lake Buena Vista": [28.377311, -81.524813],
  "Lake Helen": [28.983864, -81.231087],
  "Lake Wales": [27.920697, -81.599505],
  "Lakeland": [28.055496, -81.954772],
  "Land O' Lakes": [28.208307, -82.445842],
  "Largo": [27.905913, -82.767236],
  "Leesburg": [28.717206, -81.903089],
  "Live Oak": [30.29565, -82.985117],
  "Longwood": [28.701396, -81.348389],
  "Madeira Beach": [27.79556, -82.791566],
  "Maitland": [28.629625, -81.37291],
  "Marathon": [24.732338, -81.025122],
  "Marianna": [30.761445, -85.256258],
  "Masaryktown": [28.44184, -82.460736],
  "Melbourne": [28.110438, -80.662717],
  "Miami": [25.775163, -80.208615],
  "Miami Beach": [25.810596, -80.148852],
  "Micanopy": [29.506351, -82.280499],
  "Milton": [30.629413, -87.052598],
  "Miramar": [25.972529, -80.338582],
  "Miramar Beach": [30.384881, -86.343631],
  "Monticello": [30.542248, -83.872178],
  "Morriston": [29.281127, -82.440031],
  "Mount Dora": [28.813349, -81.633411],
  "Naples": [26.150485, -81.795299],
  "Newberry": [29.645825, -82.594604],
  "Niceville": [30.528825, -86.475995],
  "North Fort Myers": [26.717956, -81.845811],
  "North Miami": [25.900829, -80.1686],
  "North Miami Beach": [25.929996, -80.165179],
  "North Palm Beach": [26.820298, -80.056905],
  "Ocala": [29.17751, -82.151025],
  "Okeechobee": [27.241608, -80.829311],
  "Oldsmar": [28.048381, -82.671254],
  "Orlando": [28.40865, -81.254805],
  "Ormond Beach": [29.293276, -81.101447],
  "Oviedo": [28.66193, -81.187101],
  "Palatka": [29.644871, -81.676737],
  "Palm Beach Gardens": [26.848788, -80.167124],
  "Palmetto Bay": [25.621703, -80.318906],
  "Panama City": [30.166271, -85.670191],
  "Panama City Beach": [30.233151, -85.877116],
  "Pensacola": [30.440989, -87.191242],
  "Pinecrest": [25.665174, -80.304857],
  "Plant City": [28.015355, -82.117805],
  "Pompano Beach": [26.241622, -80.133851],
  "Port Charlotte": [26.989467, -82.113651],
  "Port St. Lucie": [27.280554, -80.388261],
  "Punta Gorda": [26.897754, -82.065812],
  "Ruskin": [27.706834, -82.422182],
  "Sanford": [28.789425, -81.275624],
  "Sanibel": [26.451038, -82.105676],
  "Sarasota": [27.338257, -82.543721],
  "Sebring": [27.471396, -81.451568],
  "Seminole": [27.842735, -82.785304],
  "St. Augustine": [29.896152, -81.311128],
  "St. Petersburg": [27.762727, -82.644131],
  "Stuart": [27.195272, -80.244114],
  "Tallahassee": [30.453529, -84.252272],
  "Tampa": [27.966262, -82.477618],
  "Tarpon Springs": [28.149054, -82.779371],
  "Temple Terrace": [28.043, -82.375859],
  "The Villages": [28.898947, -81.993737],
  "Treasure Island": [27.764834, -82.769119],
  "Umatilla": [28.927012, -81.664188],
  "Venice": [27.116973, -82.41519],
  "Wesley Chapel": [28.205247, -82.317108],
  "West Palm Beach": [26.745114, -80.127038],
  "White Springs": [30.331826, -82.756072],
  "Williston": [29.393879, -82.442308],
  "Wilton Manors": [26.159318, -80.13935],
  "Wimauma": [27.674909, -82.313163],
  "Winter Garden": [28.541217, -81.591241],
  "Winter Haven": [28.045836, -81.732743],
  "Winter Park": [28.59663, -81.345748],
  "Yankeetown": [29.031915, -82.763241],
  "Zephyrhills": [28.240721, -82.179024],
});

// lib/googlePhotoBackfillChristmas.js: the 38 distinct Google venue place ids behind
// the empty Christmas cards on /christmas-in-florida (read only sweep, 2026-11-23).
// Kept apart from the 5,682 browse ids so the Christmas card builder can import
// this short list without loading the whole backfill allowlist. Part of the one
// off Google photo backfill (lib/googlePhotoBackfill.js); no other use.

export const BACKFILL_CHRISTMAS_VENUE_PLACE_IDS = Object.freeze([
  "ChIJ-RBXBQFu54gRXwya8AZBGJA", "ChIJ19i72bBbw4gRbAZaOOPhzKE", "ChIJ1zIbt3sB2YgR_8jyaGTRxJg",
  "ChIJ231qjvF754gRZX6vzhb2aCk", "ChIJ28aBEDHiwogRzv5VMM80mE0", "ChIJ3X37JNb2wogRui0kn39UTk4",
  "ChIJ3yybHX3f2IgR63BD308M-Ko", "ChIJ5UOOwKux5YgRAmO1YNbhTc0", "ChIJ71KjTtzF5YgRvlsJJQkcNdU",
  "ChIJ73yw37J954gRDwQad4ih7Wk", "ChIJ772bDGhs54gRMhdOFKf6f_I", "ChIJ9_6n_N7wwogR0_89wCluWV0",
  "ChIJ9929-6Eo2YgRmS4cjSjIrvI", "ChIJBwd_fbHQ5YgR-beMDEoH2gE", "ChIJC2p8EbKj6IgRKUUx8t8-8L0",
  "ChIJCRW-9SK35YgRwOMNBWLdzRI", "ChIJdSO-6RIxw4gR8mqEBQELC84", "ChIJe2BjEpziwogRZ4IPOMe7ZT8",
  "ChIJg1HuP9xbw4gRs9PHCFmC4VU", "ChIJg6Eho03DwogRmH80oZcGWak", "ChIJgYp-DDIv2YgRH8hrgA3I3pI",
  "ChIJHWXmMdewwogRk8JI-PK3rS0", "ChIJi30UkuEe24gRhkuVM5pLihk", "ChIJIU_PARFU5IgR1BUK642d7Xc",
  "ChIJIy3zn8N754gRSSRq1a73V3g", "ChIJkXdv95vhwogR3e84WZCqrJ4", "ChIJKYka48u32YgRf_i5mqV5VaU",
  "ChIJO22mxDRBw4gRS5LpHQdZ3jQ", "ChIJPcVLPpzhwogRfnFRIurhvxs", "ChIJQwikKNrjwogR734UinU6wVs",
  "ChIJR6tho_7hwogRcONKTjQvrNk", "ChIJRxXOTQDFwogRwF74OMPdvhg", "ChIJu73by6Rbw4gR857K3YRfLQo",
  "ChIJW9D7NQbiwogRlC7BpnTMf3k", "ChIJx1DBNl1Aw4gR6Zi9XjSh7r4", "ChIJY8ox6qHGwogRuVDBPjx0laE",
  "ChIJY9d2-LiF3YgRa9P7VNGFA68", "ChIJYybWKcrvwogRT8I06QALhdI",
]);

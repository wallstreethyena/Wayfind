// Exact meeting-venue identities checked October 30, 2026.
// Primary-source citations: docs/curation/halloween-tour-meeting-points-2026-10-30.json.
// Research URLs are intentionally absent from runtime cards: ticket destinations
// come only from the existing commerce registry. No coordinates are persisted;
// each place ID must pass the runtime coordinate provenance/freshness gate.
export const HALLOWEEN_TOUR_LOCATIONS = Object.freeze(Object.fromEntries(
  Object.entries({
  "272079P1": {
    "place_id": "ChIJ98cKiInEwogRfyDonUPi2bc",
    "meetingPoint": "Tampa Theatre, 711 N Franklin St, Tampa, FL 33602",
    "browseIdentity": "usga-tampa-ghost-walk"
  },
  "usga-tampa": {
    "place_id": "ChIJ98cKiInEwogRfyDonUPi2bc",
    "meetingPoint": "Tampa Theatre, 711 N Franklin St, Tampa, FL 33602",
    "browseIdentity": "usga-tampa-ghost-walk"
  },
  "272079P3": {
    "place_id": "ChIJvfy6yovEwogRqL6O2tYonco",
    "meetingPoint": "Sal Rosa Kitchen + Bar, 601 N Florida Ave, Tampa, FL 33602"
  },
  "369692P1": {
    "place_id": "ChIJ98cKiInEwogRfyDonUPi2bc",
    "meetingPoint": "Tampa Theatre, 711 N Franklin St, Tampa, FL 33602"
  },
  "430526P1": {
    "place_id": "ChIJ7QVjUK_FwogRaTLY8uxOico",
    "meetingPoint": "SpookEasy Lounge entrance, 1909 N 15th St, Tampa, FL 33605"
  },
  "430526P2": {
    "place_id": "ChIJ7QVjUK_FwogRaTLY8uxOico",
    "meetingPoint": "SpookEasy Lounge entrance, 1909 N 15th St, Tampa, FL 33605"
  },
  "120329P6": {
    "place_id": "ChIJaVDYNb5Bw4gRbV2ffQ-VTfQ",
    "meetingPoint": "Discover Sarasota Tours, 1826 4th St, Sarasota, FL 34236"
  },
  "120329P20": {
    "place_id": "ChIJaVDYNb5Bw4gRbV2ffQ-VTfQ",
    "meetingPoint": "Discover Sarasota Tours, 1826 4th St, Sarasota, FL 34236"
  },
  "120329P4": {
    "place_id": "ChIJaVDYNb5Bw4gRbV2ffQ-VTfQ",
    "meetingPoint": "Discover Sarasota Tours, 1826 4th St, Sarasota, FL 34236"
  },
  "122676P1": {
    "place_id": "ChIJW1l9yf9654gRZTLprKzXp9Y",
    "meetingPoint": "American Ghost Adventures outside Venture X, 100 E Pine St #110, Orlando, FL 32801"
  },
  "122676P2": {
    "place_id": "ChIJQSl1y_1654gRhLYdyKVK32Q",
    "meetingPoint": "Harp & Celt Irish Pub & Restaurant, outside the Harp entrance, Orlando"
  },
  "5046OLDJAIL": {
    "place_id": "ChIJgW0dDsgn5IgRCD4brXWf9IE",
    "meetingPoint": "Old Jail Museum, 167 San Marco Ave, St. Augustine, FL 32084"
  },
  "5046P21": {
    "place_id": "ChIJgW0dDsgn5IgRCD4brXWf9IE",
    "meetingPoint": "Old Jail Museum, 167 San Marco Ave, St. Augustine, FL 32084"
  }
}).map(([code, venue]) => [code, Object.freeze(venue)]),
));

// lib/partnerCollections.js — geo-gated NEIGHBORHOOD PARTNER rails.
//
// The first is the Coconut Grove Neighborhood Association partnership (owner
// 2026-08-22). A branded card appears in the home feed ONLY for readers near
// Coconut Grove, and tapping it opens a curated sheet of the venues the CGNA
// asked us to feature, each carrying its live Wayfind Score.
//
// TWO PROPERTIES MAKE THIS SAFE AND HONEST:
//
//   1. GEO-GATED, HARD. A reader more than RADIUS_MI from the neighborhood
//      centre never receives the card. The owner's rule, verbatim: someone in
//      the area sees it; someone 20 miles away does NOT. partnerCollectionsNear()
//      is the single gate, and scripts/check-partner-collections.mjs pins the
//      radius at 20 so a later edit can't quietly widen a paid placement.
//
//   2. THE SCORE IS NEVER FAKED. The rating and review count below are a dated
//      snapshot from Google Places, but the number the card SHOWS is recomputed
//      at render by THE Wayfind Score (lib/wayfindScore.js) — the same formula
//      the rest of the app ranks with — so a partner venue can never display a
//      score the app itself would not give it. Refresh the snapshot by re-running
//      scripts/refresh-partner-collections.mjs; the displayed math stays honest
//      in between.
//
// The place objects are baked in the app's card shape (id/name/lat/lng/rating/
// reviews/types/photo) so the existing detail sheet renders them with no
// network round-trip and no discovery-gate involvement — a partner list is
// owner-asserted, exactly like an anchor.
import { wayfindScore } from "./wayfindScore.js";

const EARTH_MI = 3958.8;
export function milesBetween(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every((n) => Number.isFinite(n))) return Infinity;
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_MI * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const photoUrl = (ref) => (ref ? "/api/photo?ref=" + encodeURIComponent(ref) + "&w=640" : null);

// The seven venues the Coconut Grove Neighborhood Association asked us to
// feature. `rating`/`reviews` are a Google snapshot (2026-08-22); the SHOWN
// score is recomputed from them by wayfindScore() at hydrate() time.
const COCONUT_GROVE_PLACES = [
  {"id":"ChIJb8Zih8-32YgRgxaWQFJtIFg","name":"Barracuda","lat":25.727761,"lng":-80.243179,"rating":4.4,"reviews":950,"primaryType":"bar_and_grill","types":["bar_and_grill","sports_bar","seafood_restaurant","american_restaurant"],"photoRef":"places/ChIJb8Zih8-32YgRgxaWQFJtIFg/photos/AVoNoXTMmlk69Cog_985svZCJgR8X7Tux_vZWGTrGpfZnCnhHhIRaFspY6-hMZy2RYQosl52JXlORrest2gQjIA1q76OXnduf2lwIm6vNG75LjCp-5h_nBn9exK-SYuWFAM1CBTRqLcX4feJATveVSJNdZmSN_Ci6jKqyEjEtE73eRhAuwdR14BEONV7z8wilSxTtL_0AlCHRzkEmEdwQdrwX6QC1ORvoS7MOAXqgOXBAPnc6XbNAGnd0iR3L39CQnXKKyexapbw7uWSYJECgQx2iFjPzGllSa-zWFiZPQCfGgy_WmwJDx9IelChJzSZDweDtY_vn4O-Kr1udrWU6uzeLFkySPFiUeH1HXTWqBR8CyWldk6Nbje9EYtNNhZ0r57ZjxGDstXbE8-wgw3yPQQC0Kzts17vvUj86Mn_DDIucgz3HiOHLlG-VODP8010ul3D","address":"Parking lot, 3035 Fuller St, Coconut Grove"},
  {"id":"ChIJe1t0Q8W32YgRHGUckw_C5Uw","name":"Amal","lat":25.726471,"lng":-80.244213,"rating":4.7,"reviews":2700,"primaryType":"restaurant","types":["restaurant","lebanese_restaurant","mediterranean_restaurant","middle_eastern_restaurant"],"photoRef":"places/ChIJe1t0Q8W32YgRHGUckw_C5Uw/photos/AVoNoXSE-JPB8DsoH4UU3kXWSP02TXonGftfzoov3GmRa-Ic40a8k4Voe_VjuRSIBMUsP92kG0jOaG2LpY1VctcAliGhL3gAeL784Y7Lj26wZ55s9NfAJhszQmj5z41re6LOCqJF6ySAo67V0r3RDFUloaZ6T7ZNcjHfdI299Z3Ta0riOndkE-nW45Nve9VQ6VxQ_UBaAWj2x8Rvpdg_qZl7SkLP2IQAuqR1fnO_Klkx_6yZKkdQhdqEeXyGFZsZjgRh5Dju3xyaCuxgmpfeOO4DWO4zUvOB9zKwuG0i3D2GCzyRWubWz-OC278KKGRLvR2Li0BfIdf4uxwk0fRWn7H7jW3Ek6LtCIjFtb8qamqMBl3tkmdSuF2CSuQXsEHZa3ydXv7Q2bYBqJfuZ5kE5kMDaLh_ZsE4qTV4IYfIF8GzcoL3TPNI","address":"3480 Main Hwy Ste 100, Miami"},
  {"id":"ChIJVVVFQsW32YgRshiwWyuedns","name":"Level 6","lat":25.726456,"lng":-80.244222,"rating":4.8,"reviews":3350,"primaryType":"restaurant","types":["restaurant","food","point_of_interest","establishment"],"photoRef":"places/ChIJVVVFQsW32YgRshiwWyuedns/photos/AVoNoXTN6c7rXgbkPp_BJ4eguNWlRs0aL7NtpQzOs8RPXM5b-hvU05a7Io5LTjmxZboVohJmMQj67l4-PvV0C-rbqaEC_YNbUGUZhBygkf4s9wdV6rH2BnPLk5Jt4KVI2Z95qUhrcJqOYBB7CFtRWUG69pnzHfeY35rS_zD6BEA1emAgerxjAjpU7ALiU5VIdoeaoLj0qjG3vEHcg9WtITSj8uT1iLXcC1kl-DH54CrjBRyLRS3Bq-sNofDjKGNcw3x7QIgc5ER321yRsmKZblzaYEJXft4U9-C3ivju4VkXxK3u7WP9RxSABBOsfpuwxArOSmDYbM75jbMjqauUdYmY8i56VdIjF4CKB3GOmH1X8aJQx2PnrD6RMTlYXtUDy3iALtq9f3d9pKPqa6Lb4m6SrR6bmuz_7GlssWmteMlEOe5Qfs8m","address":"3480 Main Hwy 6th floor, Coconut Grove"},
  {"id":"ChIJZRBieMW32YgRe9uja7jsGmQ","name":"Sapore di Mare","lat":25.72731,"lng":-80.242833,"rating":4.5,"reviews":1530,"primaryType":"italian_restaurant","types":["italian_restaurant","seafood_restaurant","restaurant","point_of_interest"],"photoRef":"places/ChIJZRBieMW32YgRe9uja7jsGmQ/photos/AVoNoXQfQFo9D1OlyxvX5oxrU78PqkzaVxNct3uBFMr2JmrhibpTBkaRqiGxqDMmSaUAsKsm_wtlIS79mrGHQdlLDVJZxCN2tbOYGBCBiSO4yGk89uV4zqokz7vQUQCE_wZR5vi2bSOdorpDIgBQ2ojOn3X221hw8Nr4646T5yrOk9RgjGQNYzyTJL2Lxl3o0q3XDCivHUhYk0ds8k90KkeT4M7LH1fqHgjaQWaz9gfUklHVQz1dcKt1wewv2t_JvnhsGjgZemJG6k2nE1gAYs9E6hKy2VG6rCUViYxx6L0UoXreUn7mu3ypp9Q0ou2WB92DVRO1pSIy30u4eQTfahWUybKYgskGeBWodQw2vdVkyfJg-yCzZT7hDfGXTPGGHNc42AfcNRAG-lbVnSaQVAawVAXeAcRWE4Ztq3MjVIwcKABemg","address":"3433 Main Hwy, Miami"},
  {"id":"ChIJY7MwUQy32YgR39Vs9IYxci4","name":"BodyRok","lat":25.728972,"lng":-80.241977,"rating":4.8,"reviews":55,"primaryType":"gym","types":["gym","sports_complex","sports_school","sports_activity_location"],"photoRef":"places/ChIJY7MwUQy32YgR39Vs9IYxci4/photos/AVoNoXR8XquKzLQsyhTl27_Y3ouIwf8osI2x-1BYFqHyao6EiBocQX0IpeM2Ju9dB2OwYFccSJMhZ0TxoyVBIlRiZOTa1lgUWMtY75jT6Vbg7LhnvMRLR00tS736HG4wOJTJu0cudsJB1C-LkD3rHqrXK-cZD-CQrDEJgrxWVWobsxA6zyrRqvWXGfm4kjiVAj0gm-AWXS0NXq4xtBC3n6PduVtQWaPyot7h9YAM2kCSZSljM2Yw8ai-OZWChtpensuMx_NTtT23kKNWUbuJ3KBA5Q9xFZNLWCrVVPMa5fPpP6HS30nitnlt_7Jlu0fSbRC8Fa0WA0EAFeqwLedTYEnwfbCusMEXwIvPvVvaSWrKJnLOOrR931cOug8B6ztEsHr2DpEOwJqqPS38UEV-qexoc0NvGgql1kLoEkXxEUoHrU3wnfBNBPn_PjPjLOl5lhkN","address":"3015 Grand Ave #216, Miami"},
  {"id":"ChIJKYka48u32YgRf_i5mqV5VaU","name":"Ritz-Carlton Coconut Grove","lat":25.730447,"lng":-80.238056,"rating":4.5,"reviews":1295,"primaryType":"hotel","types":["hotel","wedding_venue","lodging","event_venue"],"photoRef":"places/ChIJKYka48u32YgRf_i5mqV5VaU/photos/AVoNoXTdDfZaHZ3RD-3NpvpadIMwyRWl0RgJdrc-ZpiBPoMLK85sBINsDAn-ZPnDxxxXu7-nJxur4EGj8i6-kHY746sTZQvuyAUE6y0F0LQO0ftcqb07hxCYGs8rGQM2Tr3d64q17XU43JrEEKNBTjpsZ8zbqJzMDYC6zbGSjM6wLhrQTxG0giay_jOcjkwKX-Ag2WhoJrV-oKm27HRD2edUaNQbBhzy6oMhoVMri99Xtf-n20NTb-gokokSMKqM93xMDbb2jGFIO3H6lNOM8CsBEulHEXx4xSeOqWzYMY6m0JTydGH79eYoGwVXzA5TTTacN9cygtSQtypbuAnb4XS-ApbqdqtfQGrxcm4Ep1fX8pcbeYr3QO-3xW9Sg24DZjaY03Ce-E6W7bbsmDeNgLT8LvHEYoDkoEeh5JOOfkRhwnri6oC8wCqtMOLwE8e2_c7P","address":"3300 SW 27th Ave, Miami"},
  {"id":"ChIJ1cyBvGa32YgRKpni9-JNbbo","name":"Grand Public","lat":25.728336,"lng":-80.242369,"rating":4.8,"reviews":266,"primaryType":"american_restaurant","types":["american_restaurant","steak_house","sports_bar","cocktail_bar"],"photoRef":"places/ChIJ1cyBvGa32YgRKpni9-JNbbo/photos/AVoNoXTZBilNgUmAjFwAiJN6j6Urn_eZ0XQ_apnMYce874FBeOVTGXb7msSWY8rY0joytm6JRYf052V7WVqesS6PcVMHqAIBtlPXreFGQZurhRjguom6LPRyAckJDk9U9zZ5TBLnBXLLoxt-BfFWadsL99-Gtq-bzG6_m6vNrQL8pmmUdEHmm_seQ8zTZeesXtjSTNnonX3Ris4EigGXVmzEJcf92fWMuRsu3OvB3_fjuYpxbZHBsaYO-p02dM6C3-lNeECKYVqfx7JeS_FqFi4-yVy-p7r5p54_GHPq8b7DsD7S28eZq6wCWCKb3CP5JEgst3QKKsgpCzM21sgoi8Od2QLt3TPNb9Aw5s_7xbT7l95qyw7rGz-RovZojWl4P5BR6ARsd6nQmGmLgLLjdsHM0ARh4JcVgDotpOwMI2OVTSHk2Mkb_BmMWiCM-qUh7g","address":"3015 Grand Ave Ste 201, Coconut Grove"},
];

// The collections. Each declares its own geo-gate (centre + radius) and its
// splash art. Adding a second neighborhood is a new entry here — nothing in
// home.js changes.
export const PARTNER_COLLECTIONS = [
  {
    id: "coconut-grove",
    partner: "Coconut Grove Neighborhood Association",
    // The AMAZON-RAIL tile (the horizontal promo rail). `tileArt` is the
    // basename in /public/cards-v8 (avif/webp/jpg at 380w + 760w), generated
    // from the sponsor art — so the tile IS the card, exactly like every other
    // rail tile whose headline lives in pixels.
    tileArt: "coconut-grove",
    tileTitle: "Coconut Grove",
    tileShort: "What's happening in the Grove",
    // Sheet-header copy (the splash carries its own title art)
    eyebrow: "CGNA × Wayfind · Top Sponsor",
    title: "What's Happening in Coconut Grove?",
    sub: "We already found what's worth showing up for.",
    cta: "Discover Coconut Grove",
    accent: "#2FB39B",           // the Grove teal
    // The sheet hero — the partner's own art (public/partners/coconut-grove.png)
    heroImage: "/partners/coconut-grove.png",
    creditLine: "Curated locally · Ranked by Wayfind · In partnership with the Coconut Grove Neighborhood Association",
    // THE GATE. 20 miles from the neighborhood centre, per the owner.
    center: { lat: 25.7272, lng: -80.2578 },
    radiusMi: 20,
    places: COCONUT_GROVE_PLACES,
  },
];

/**
 * Every partner collection whose gate contains (lat,lng). Empty when the reader
 * is outside every gate — the common case, and the whole point: a Coconut Grove
 * placement must not render in Tampa. Nearest-centre first when more than one
 * ever overlaps.
 */
export function partnerCollectionsNear(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return PARTNER_COLLECTIONS
    .map((c) => ({ c, mi: milesBetween(lat, lng, c.center.lat, c.center.lng) }))
    .filter((x) => x.mi <= x.c.radiusMi)
    .sort((a, b) => a.mi - b.mi)
    .map((x) => x.c);
}

/** A collection by id, or null. */
export function partnerCollectionById(id) {
  return PARTNER_COLLECTIONS.find((c) => c.id === id) || null;
}

/**
 * The SYNTHETIC amazon-rail tile for the reader's location, or null. home.js
 * passes this to DaypartRail, which pins it to the front of the rail. Because
 * it is built from partnerCollectionsNear(), the tile is ALREADY geo-gated:
 * outside every gate this returns null and no sponsor tile renders.
 */
export function sponsorRailNear(lat, lng) {
  const c = partnerCollectionsNear(lat, lng)[0];
  if (!c) return null;
  return { id: "sponsor-" + c.id, art: c.tileArt, title: c.tileTitle, short: c.tileShort, sponsor: true, partner: c.id };
}

/**
 * Turn a collection into the { places, ... } payload the home detail sheet
 * consumes. Adds distMi from the reader and the LIVE Wayfind Score (never the
 * baked snapshot), and routes photos through the app's own /api/photo proxy.
 */
export function hydratePartnerCollection(collection, center) {
  if (!collection) return null;
  const here = center && Number.isFinite(center.lat) ? center : collection.center;
  const places = (collection.places || []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    distMi: milesBetween(here.lat, here.lng, p.lat, p.lng),
    rating: p.rating,
    reviews: p.reviews,
    wfScore: wayfindScore(typeof p.rating === "number" ? p.rating : 0, p.reviews || 0),
    types: Array.isArray(p.types) ? p.types : [],
    photo: photoUrl(p.photoRef),
    openNow: null,
    businessStatus: "OPERATIONAL",
    _partner: collection.id,          // provenance: this card came from a partner list
  }));
  return {
    id: "partner-" + collection.id,
    key: "partner-" + collection.id,
    theme: "partner-" + collection.id,
    label: collection.eyebrow,
    emoji: "🌴",
    themeTitle: collection.title,
    take: collection.sub,
    accent: collection.accent,
    heroImage: collection.heroImage,
    partnerSplash: true,              // HookDetail suppresses its own title overlay
    creditLine: collection.creditLine,
    places,
  };
}

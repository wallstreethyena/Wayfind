// lib/beaches.js — the beach ranking + share intelligence (owner, 2026-07-21).
// Everything here is derived from REAL signals: Google rating × review depth
// through the ONE Bayesian formula (lib/google wayfindScore). The why-lines
// speak Wayfind voice about the METRIC — what earns the rank — and never
// invent sand, water, or crowd claims the data does not carry.
import { toDisplayScore } from "./score.js";

// The ONE Bayesian score formula. It used to be inlined here "so this module
// stays node-testable with zero app imports" — a real constraint, solved better
// by lib/wayfindScore.js, which has zero imports of its own. Drift is now
// impossible rather than merely detected.
import { wayfindScore } from "./wayfindScore.js";

export const BEACH_METROS = {
  "manatee-sarasota": { label: "Sarasota & Anna Maria", short: "Sarasota" },
  tampa: { label: "Tampa Bay", short: "Tampa Bay" },
  orlando: { label: "Orlando", short: "Orlando" },
};

// The share photo per group — chosen by eye (Claude, 2026-07-21) from the
// groups' own Google photos, per the owner's rule: the most beautiful
// picture, regardless of the place's rank. Notes record why, so the next
// pick has a standard to beat.
export const BEACH_SHARE_PHOTO = {
  "manatee-sarasota": {
    place_id: "ChIJ5eLMVXE9w4gR15l0tMZGkMY",
    name: "Coquina Beach",
    photo_ref: "places/ChIJ5eLMVXE9w4gR15l0tMZGkMY/photos/AaVGc3naEBEwnm2wvQcRVxw_MeD51txfVWUJTnKHPYTIW4G0xxED0Js6gVPYWt5zcQdTtRPK14CuT_bVflzwr1JHlNmtpahWCW_eoczd23qgek7pJLAclybeSlDd6DLw8-WHoa4Cl7WPp-YfR5KdaotCQSo6LtalxM7c-x-toEpyN2ooyjGoKE6hj-tNiEiEgowYenTqjHLiGb780vUZiMV_RwmGVsBbSEcjAGgV1_3Bef4YjMmkLfcUtpBORYk4owJENYJsMcQCxmgo50OxoDeDtvzf-jbXIdD0K4-Sh-SQ9IknhGk7gKKalYBgiGWkazTJZxo0C4wRWs8B5GwbhYtV4ka2AdwFtrgMqjxQTh2b4I_P1KZZXqr-tdEQoape7ss8eUVWqGWuIWgPCS85zkTOK1st_NGbIkKb4__w6b03AXwUVWPY",
    why: "turquoise-to-indigo gradient, storm-lit clouds, curving foam line — landscape, instantly postcard",
  },
  tampa: {
    place_id: "ChIJaYBHb6sEw4gRBYA3lr6HfCk",
    name: "North Beach At Fort DeSoto Park",
    photo_ref: "places/ChIJaYBHb6sEw4gRBYA3lr6HfCk/photos/AWCwydjdi2N-iTgHBvRRsOYPuCobiUFUsJ01omyRqti9n3ajs5bTAOM6XVIIRc9KGz5BN2sorfoyWpMRXPZORQ9X5ovFJds0l84JSuCim5in_TEaSey27KME4sxCiGzN_cAVPo-FrdCJgvf55v4mmyhbNSIumuXh_POyr-XIN52BvXqf2-qyBeMFjC4Ck-qNNS-t9v3lCStWSO2xECQ85l7um93dVZ-7ckUfcFsbsCxOqb-M-xJz3SYC7GNug5QZHRHKidQDWkDB7ZEbBfTIT6DDc3r0SVw9qcNey3chFj-vH2V9jc7fY4KovvNMdnYaYGLm0DvskvQ19iLbx7FRkPO-vdAR-sbBUPafVNWuB_I9hqxaokYUmMX__MUO46SkibaYfzmc8B1DwAdf5wwGOiQEy9UrdvaX34cr9_95u1YlgMJBIXiv",
    why: "glass-clear shallows over a sandbar, clean horizon — serene and unmistakably Gulf",
  },
  orlando: {
    place_id: "ChIJiZ9hPhaA54gRljBaWokEW5c",
    name: "West Beach Park",
    photo_ref: "places/ChIJiZ9hPhaA54gRljBaWokEW5c/photos/AWCwydhWe5wDb56vLDdqvquWliKsHaXwyFqEHKVSFMetHPFfLqdA9Rwm3VEapFna1X9Xj9UDpCRsoJs-1-Q3HvuOLwP5VCNgRhSrIs_axlnDfBpR0Z9GMCyIMPdQ5powgfbcPyWTMMkP6RCQim7LtXr8GffjVXJ_Wte4w4PmddEvlIsd5vk3_IeBkaGtgzSkbklJSK8KWDN6HYgj0Gf78nrEiKD_IYZhZzLcy_7STSkar1B_Q3Su8aS-dnIlUEn0gNTye4wDyTivB3QyU6Pz2uHXrgFJ_TkjoB38WiRH3DCp9Uw6jqq9ATmzkhLhHfydXY00FlTB0YvPnXCW7iKYHGYF7-N5ZwBv2DyjN2-CVBHr_UvCt6sqOXR2KfYVdiGLKpLFVjp7l8ftSdJxwxQvxnlqr6bzqGEc_0J5hbgZKpM00Lec5-EO",
    why: "golden lakeside sunset through the pines — the group's only beach, and a genuinely lovely frame",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// THE 23-MILE RULE (owner, 2026-07-28).
//
// The bug: the homepage recommended a "Beach day" to a user in Orlando, whose
// nearest real beach is ~60 miles away. The card rendered unconditionally and
// deep-linked to a hardcoded Gulf-coast metro. Recommending sand to someone
// two hours inland is the single most obviously wrong thing the app can do.
//
// The rule, in the owner's words: "a beach should not be recommended unless
// there is a beach within 23 miles of them... something that has the word beach
// should be vetted." So: nothing beach-shaped reaches a recommendation surface
// without passing a real geographic test against the user's real location.
//
// WHY THIS IS FREE. Every place object in the app already carries coordinates
// (Google/Foursquare/outdoors rows) or a server-computed distance (the
// wf_nearest_beaches RPC returns distance_mi per row and the client was simply
// throwing it away). So the vetting is arithmetic on data we already paid for:
// zero new API calls, zero new round trips, zero new spend. The owner asked us
// to "get creative" about cost — the creative part is that the cheapest
// geographic pull is the one already sitting in memory.
//
// FAIL-CLOSED, deliberately. A beach-shaped row with no usable coordinates and
// no distance is DROPPED, not kept. This mirrors inCuratedRegion() in home.js:
// when we cannot prove a place is near you, we do not claim that it is.
export const BEACH_NEAR_MI = 23;

function haversineMi(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Number() coerces null/""/false to 0, and 0 is a perfectly valid latitude —
// so an absent center would silently become the Gulf of Guinea and every beach
// on earth would measure "far" (or, worse, some would measure near). Reject the
// empty values explicitly before coercing.
const num = (v) => { if (v === null || v === undefined || v === "" || typeof v === "boolean") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// Miles from `center` to a place/beach row, or null when it cannot be proven.
// Real coordinates win over any precomputed distance: a row's distance_mi was
// measured from whatever point the SERVER searched around, which is not always
// where the user actually is (event flows search near the venue, city flows
// near the city). Recomputing here makes the number mean "from you".
export function beachMilesFrom(b, center) {
  if (!b) return null;
  const cLat = num(center && center.lat), cLng = num(center && center.lng);
  const lat = num(b.lat != null ? b.lat : b.latitude), lng = num(b.lng != null ? b.lng : b.longitude);
  if (cLat != null && cLng != null && lat != null && lng != null) return haversineMi(cLat, cLng, lat, lng);
  const d = num(b.distance_mi != null ? b.distance_mi : b.distMi);
  return d != null && d >= 0 ? d : null;
}

// Non-venue tokens that mean "this thing is actually made of sand and water".
const BEACH_VENUE_RE = /restaurant|food|cafe|coffee|bar\b|pub|brewery|store|shop|mall|market|bakery|deli|lodging|hotel|motel|resort|inn\b|spa\b|salon|gym|real_estate|church/;

// "Does this row say beach?" — the trigger for vetting, NOT a claim of truth.
// A TYPE of beach always counts. A NAME containing "beach" counts only when the
// row is not plainly a business ("Beach Bum Burgers", "Beachside Nails"), which
// is the same distinction isBeach() draws in app/home.js.
export function saysBeach(p) {
  if (!p) return false;
  if (p.category === "beach" || p.cat === "beach") return true;
  const types = ((Array.isArray(p.types) ? p.types.join(" ") : "") + " " + (p.type || "")).toLowerCase();
  if (types.includes("beach")) return true;
  // `name` on Places rows, `title` on the wf_things_to_do / wf_best_picks rows.
  const label = String(p.name || p.title || "").toLowerCase();
  if (!label.includes("beach")) return false;
  return !BEACH_VENUE_RE.test(types);
}

// Beach rows -> only those provably within maxMi of the user, with distance_mi
// rewritten to the distance FROM THE USER so every surface that prints it is
// honest. Sort order is untouched (rankBeaches still decides rank).
export function beachesWithin(rows, center, maxMi = BEACH_NEAR_MI) {
  const out = [];
  for (const b of rows || []) {
    const mi = beachMilesFrom(b, center);
    if (mi == null || mi > maxMi) continue;
    out.push({ ...b, distance_mi: mi });
  }
  return out;
}

// The universal vet for MIXED place lists: everything that does not say beach
// passes through untouched; everything that does must prove it is within
// maxMi. One function, applied at the chokepoints, so a beach can never again
// appear on a surface belonging to a user who is nowhere near one.
export function vetBeachDistance(places, center, maxMi = BEACH_NEAR_MI) {
  if (!Array.isArray(places) || !places.length) return places || [];
  return places.filter((p) => {
    if (!saysBeach(p)) return true;
    const mi = beachMilesFrom(p, center);
    return mi != null && mi <= maxMi;
  });
}

export function beachScore(b) {
  return wayfindScore(b.rating, b.reviews);
}

// Rank on the RAW (unrounded) Bayesian value with review depth as the
// tiebreak — two 9.6-display beaches still order deterministically, and the
// hero slide and the ranking page can never disagree again (they both call
// THIS function; the slide's own inline sort caused the Siesta miss report).
function bayesRaw(b) {
  const v = Number(b.reviews) || 0, m = 60, C0 = 3.9;
  return Number(b.rating) > 0 ? (v / (v + m)) * Number(b.rating) + (m / (v + m)) * C0 : 0;
}
const nameKey = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export function rankBeaches(rows) {
  const ranked = (rows || [])
    .filter((b) => b && b.name && Number(b.rating) > 0)
    .map((b) => ({ ...b, wf: beachScore(b), _raw: bayesRaw(b) }))
    .sort((a, b) => (b._raw - a._raw) || ((b.reviews || 0) - (a.reviews || 0)) || String(a.name).localeCompare(String(b.name)));
  // one row per beach: "Ben T Davis Beach" and "Ben T Davis beach" are the
  // same sand — the strongest row wins, duplicates vanish from every surface
  const seen = new Set();
  return ranked.filter((b) => { const k = nameKey(b.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((b, i) => ({ ...b, rank: i + 1 }));
}

// Wayfind-voice why-line: explains the RANK from the metric itself. Few
// words, no adjectives the data can't back.
export function beachWhy(b, group) {
  const score = toDisplayScore(b.wf);
  const vol = Number(b.reviews) || 0;
  const volTxt = vol >= 1000 ? (Math.round(vol / 100) / 10).toLocaleString() + "k" : String(vol);
  if (b.rank === 1) return `${score}/10 — the strongest rating-to-depth ratio of all ${group} beaches: ${b.rating}★ held across ${volTxt} reviews.`;
  if (b.rank <= 3) return `${score}/10 — ${b.rating}★ from ${volTxt} reviews. Depth is the tiebreaker: this many people rarely agree.`;
  return `${score}/10 · ${b.rating}★ · ${volTxt} reviews`;
}

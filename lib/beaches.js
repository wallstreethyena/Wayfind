// lib/beaches.js — the beach ranking + share intelligence (owner, 2026-07-21).
// Everything here is derived from REAL signals: Google rating × review depth
// through the ONE Bayesian formula (lib/google wayfindScore). The why-lines
// speak Wayfind voice about the METRIC — what earns the rank — and never
// invent sand, water, or crowd claims the data does not carry.
import { toDisplayScore } from "./score.js";

// The ONE Bayesian score formula, inlined so this module stays node-testable
// with zero app imports (the engines convention). Constants MUST match
// lib/google.js wayfindScore (m=60, C=3.9) — test-beaches-page.mjs compares
// both sources and fails the build if they ever drift.
function wayfindScore(rating, reviews) {
  if (!rating) return null;
  const m = 60;
  const C = 3.9;
  const v = reviews || 0;
  const bayes = (v / (v + m)) * rating + (m / (v + m)) * C;
  return Math.round((bayes / 5) * 100);
}

// Coastal metros ONLY. Orlando is inland — its only inventory "beach" was West
// Beach Park, an inland lake PARK with a playground that Google types `park`
// (not `beach`), which is exactly the "park masquerading as a beach" bug this
// ranking must never surface. With no genuine beach nearby, Orlando has no beach
// page; the classifier guard (lib/placeCategory isRealBeach) keeps it out of the
// pool at the source. Re-add a metro here only once inventory holds a real beach.
export const BEACH_METROS = {
  "manatee-sarasota": { label: "Sarasota & Anna Maria", short: "Sarasota" },
  tampa: { label: "Tampa Bay", short: "Tampa Bay" },
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
};

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

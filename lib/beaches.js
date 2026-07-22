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

export function beachScore(b) {
  return wayfindScore(b.rating, b.reviews);
}

export function rankBeaches(rows) {
  return (rows || [])
    .filter((b) => b && b.name && Number(b.rating) > 0)
    .map((b) => ({ ...b, wf: beachScore(b) }))
    .sort((a, b) => (b.wf ?? 0) - (a.wf ?? 0))
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

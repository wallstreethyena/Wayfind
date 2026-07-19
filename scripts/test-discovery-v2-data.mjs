// scripts/test-discovery-v2-data.mjs — lock test for the Discovery v2 adapter.
//
// lib/discoveryV2Data.js mirrors two formulas that lib/google.js owns
// (wayfindScore, distMeters) because google.js is "use client" and pulls in the
// Maps SDK. A mirror is a drift risk, so this suite pins it from both ends:
//   1. the constants in the mirror match the ones in lib/google.js source
//   2. the mirror reproduces a fixed output table (incl. the null-rating case)
// If anyone edits either side, this goes red in prebuild.

import { readFileSync } from "node:fs";
import {
  bayesScore, haversineMeters, photoHref,
  invPlaceToCard, invPlacesToCards, categorySearchUrl,
} from "../lib/discoveryV2Data.js";

let n = 0, bad = 0;
const ok = (cond, label) => { n++; if (!cond) { bad++; console.error(`  FAIL: ${label}`); } };

// ---- 1. constants parity with lib/google.js -------------------------------
const g = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const fn = g.slice(g.indexOf("export function wayfindScore"));
const body = fn.slice(0, fn.indexOf("\n}"));
ok(/const m = 60;/.test(body), "google.js wayfindScore still uses m = 60");
ok(/const C = 3\.9;/.test(body), "google.js wayfindScore still uses C = 3.9");
ok(/if \(!rating\) return null;/.test(body), "google.js wayfindScore still returns null for absent rating");
ok(/\(bayes \/ 5\) \* 100/.test(body), "google.js wayfindScore still scales to 0-100");

const dm = g.slice(g.indexOf("export function distMeters"));
ok(/const R = 6371000;/.test(dm.slice(0, 400)), "google.js distMeters still uses R = 6371000");

// ---- 2. score output table ------------------------------------------------
// Independently computed from the Bayesian formula, not copied from the impl.
const bayes = (r, v) => Math.round((((v / (v + 60)) * r + (60 / (v + 60)) * 3.9) / 5) * 100);
for (const [r, v] of [[4.8, 6058], [4.6, 2000], [5.0, 3], [3.2, 150], [4.0, 0]]) {
  ok(bayesScore(r, v) === bayes(r, v), `bayesScore(${r}, ${v}) === ${bayes(r, v)}`);
}
ok(bayesScore(null, 500) === null, "null rating -> null score (never a fake 0.1/10)");
ok(bayesScore(0, 500) === null, "zero rating -> null score");
ok(bayesScore(5.0, 3) < bayesScore(4.6, 2000), "few-review 5.0 cannot outrank proven 4.6");

// ---- 3. distance ----------------------------------------------------------
const parrish = { lat: 27.5689, lng: -82.4393 };
ok(haversineMeters(parrish, parrish) === 0, "distance to self is 0");
ok(Math.abs(haversineMeters(parrish, { lat: 27.3364, lng: -82.5307 }) / 1609.34 - 16.9) < 1.5,
  "Parrish -> Sarasota is ~17 mi");
ok(haversineMeters(null, parrish) === null, "null point -> null, never NaN");

// ---- 4. photo href --------------------------------------------------------
ok(photoHref("places/X/photos/Y") === "/api/photo?ref=places%2FX%2Fphotos%2FY&w=640",
  "photo ref is proxied and URL-encoded");
ok(photoHref(null) === null, "absent photo ref -> null, never a broken img src");

// ---- 5. the adapter -------------------------------------------------------
const wire = {
  id: "abc",
  displayName: { text: "Myakka River State Park" },
  location: { latitude: 27.2419, longitude: -82.3129 },
  rating: 4.7,
  userRatingCount: 9000,
  types: ["park"],
  photos: [{ name: "places/abc/photos/1" }],
  editorialSummary: { text: "Expansive trails and wildlife." },
  businessStatus: "OPERATIONAL",
};
const card = invPlaceToCard(wire, parrish);
ok(card.name === "Myakka River State Park", "displayName.text -> name");
ok(card.photo === "/api/photo?ref=places%2Fabc%2Fphotos%2F1&w=640", "photos[0].name -> proxied photo");
ok(card.wfScore === bayes(4.7, 9000), "wfScore uses the pinned formula");
ok(card.distMi > 20 && card.distMi < 30, "distMi derived from center");
ok(card.editorial === "Expansive trails and wildlife.", "editorialSummary.text -> editorial");
ok(card._wfInventory === true, "provenance marker preserved");

ok(invPlaceToCard(null, parrish) === null, "null row -> null");
ok(invPlaceToCard({ displayName: { text: "" } }, parrish) === null, "nameless row -> null (card gate)");
ok(invPlaceToCard({ ...wire, rating: undefined }, parrish).wfScore === null,
  "unrated place -> null score, not 0");

const passthrough = { name: "Already Shaped", wfScore: 88 };
ok(invPlaceToCard(passthrough, parrish) === passthrough, "app-shaped row passes through untouched");

ok(invPlacesToCards([wire, null, { displayName: { text: "" } }, wire], parrish).length === 2,
  "invPlacesToCards drops unusable rows");
ok(invPlacesToCards(undefined, parrish).length === 0, "non-array input -> empty, never throws");

// ---- 6. the read URL stays on owned inventory -----------------------------
const url = categorySearchUrl({ cat: "attractions", lat: 27.5689, lng: -82.4393 });
ok(url.includes("inv=1"), "category read is pinned to owned inventory (inv=1)");
ok(url.includes("q=inventory"), "category read uses the inventory query");
ok(url.includes("cat=attractions"), "category is passed through");
ok(url.includes("lat=27.5689") && url.includes("lng=-82.4393"), "center is rounded to 4dp");
ok(!/[A-Z_]+=undefined/.test(url), "no undefined params leak into the request");

if (bad) { console.error(`test-discovery-v2-data: ${bad}/${n} FAILED`); process.exit(1); }
console.log(`test-discovery-v2-data: OK — ${n} assertions (score/distance mirrors pinned to lib/google.js, adapter gates nameless + unrated rows, reads stay on owned inventory)`);

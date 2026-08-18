#!/usr/bin/env node
// scripts/resolve-birthday-place-ids.mjs — fill lib/birthdayPlaceIds.js for
// BIRTHDAY_UNIVERSE entries that shipped with venue.placeId:null.
//
// Same one-shot credentialed tool as scripts/resolve-summer-place-ids.mjs —
// see that file's header for the fail-closed matching rules (searchText hit
// must land within MATCH_RADIUS_MI of the registry's own coordinates AND
// share the venue name's distinctive root; a miss writes NOTHING).
import { readFileSync, writeFileSync } from "node:fs";
import { BIRTHDAY_UNIVERSE } from "../lib/birthdayUniverse.js";
import { BIRTHDAY_PLACE_IDS } from "../lib/birthdayPlaceIds.js";

const KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
if (!KEY) {
  console.error("resolve-birthday-place-ids: GOOGLE_MAPS_SERVER_KEY is not set — run where server credentials exist.");
  process.exit(1);
}

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
const haversineMi = (aLat, aLng, bLat, bLng) => {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
};
const MATCH_RADIUS_MI = 30;

const STOP = new Set(["the", "of", "at", "and", "a", "in", "on", "restaurant", "bar", "events", "event", "kitchen", "lounge"]);
const roots = (n) => String(n).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const nameMatches = (want, got) => {
  const g = String(got).toLowerCase();
  const r = roots(want);
  return r.length === 0 || r.some((w) => g.includes(w));
};

const unresolved = BIRTHDAY_UNIVERSE.filter((e) => !e.venue.placeId && !BIRTHDAY_PLACE_IDS[e.key]);
console.log(`resolve-birthday-place-ids: ${unresolved.length} unresolved of ${BIRTHDAY_UNIVERSE.length} entries`);

const out = { ...BIRTHDAY_PLACE_IDS };
let hits = 0, misses = 0;
for (const e of unresolved) {
  const q = `${e.venue.name} ${e.venue.city} Florida`;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location",
    },
    body: JSON.stringify({
      textQuery: q,
      maxResultCount: 3,
      locationBias: { circle: { center: { latitude: e.venue.lat, longitude: e.venue.lng }, radius: 50000 } },
    }),
  }).catch(() => null);
  if (!r || !r.ok) { console.log(`  MISS ${e.key}: HTTP ${r ? r.status : "network"}`); misses++; continue; }
  const data = await r.json().catch(() => ({}));
  const hit = (data.places || []).find((p) => p && p.id && p.location
    && haversineMi(e.venue.lat, e.venue.lng, p.location.latitude, p.location.longitude) <= MATCH_RADIUS_MI
    && nameMatches(e.venue.name, (p.displayName && p.displayName.text) || ""));
  if (!hit) { console.log(`  MISS ${e.key}: no verified match for "${q}"`); misses++; continue; }
  out[e.key] = hit.id;
  hits++;
  console.log(`  OK   ${e.key} -> ${hit.id} (${(hit.displayName && hit.displayName.text) || "?"})`);
}

if (hits) {
  const path = new URL("../lib/birthdayPlaceIds.js", import.meta.url).pathname;
  const src = readFileSync(path, "utf8");
  const body = "export const BIRTHDAY_PLACE_IDS = " + JSON.stringify(out, null, 2).replace(/"([a-z0-9_]+)":/g, "$1:") + ";\n";
  const next = src.replace(/export const BIRTHDAY_PLACE_IDS = \{[\s\S]*?\};\n/, body);
  if (next === src) { console.error("resolve-birthday-place-ids: could not splice the sidecar — export shape changed?"); process.exit(1); }
  writeFileSync(path, next);
  console.log(`resolve-birthday-place-ids: wrote ${hits} new id(s) (${misses} miss${misses === 1 ? "" : "es"} left fail-closed)`);
} else {
  console.log(`resolve-birthday-place-ids: nothing written (${misses} miss${misses === 1 ? "" : "es"})`);
}

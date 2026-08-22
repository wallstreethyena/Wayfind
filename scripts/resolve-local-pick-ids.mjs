#!/usr/bin/env node
// scripts/resolve-local-pick-ids.mjs — fill lib/localPickIds.js for
// LOCAL_PICK_VENUES entries that shipped with placeId:null.
//
// Same one-shot credentialed tool as scripts/resolve-birthday-place-ids.mjs —
// see that file's header for the fail-closed matching rules. One difference:
// a few venues in this registry have no coordinates of their own yet, so they
// are biased and radius-checked against the centre of the FIRST market that
// places them, at the tighter MARKET_RADIUS_MI. A miss writes NOTHING.
import { readFileSync, writeFileSync } from "node:fs";
import { LOCAL_PICK_VENUES, LOCAL_PICKS, LOCAL_PICK_MARKETS } from "../lib/localPicks.js";
import { LOCAL_PICK_IDS } from "../lib/localPickIds.js";

const KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
if (!KEY) {
  console.error("resolve-local-pick-ids: GOOGLE_MAPS_SERVER_KEY is not set — run where server credentials exist.");
  process.exit(1);
}

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
const haversineMi = (aLat, aLng, bLat, bLng) => {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
};
const MATCH_RADIUS_MI = 20;
const MARKET_RADIUS_MI = 15;

const STOP = new Set(["the", "of", "at", "and", "a", "in", "on", "restaurant", "bar", "club", "park", "market", "cafe", "company"]);
const roots = (n) => String(n).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const nameMatches = (want, got) => {
  const g = String(got).toLowerCase();
  const r = roots(want);
  return r.length === 0 || r.some((w) => g.includes(w));
};

const firstMarketFor = (key) => {
  const p = LOCAL_PICKS.find((x) => x.key === key);
  return (p && LOCAL_PICK_MARKETS[p.market]) || null;
};

const pending = Object.entries(LOCAL_PICK_VENUES)
  .filter(([k, v]) => !v.placeId && !LOCAL_PICK_IDS[k]);
console.log(`resolve-local-pick-ids: ${pending.length} unresolved of ${Object.keys(LOCAL_PICK_VENUES).length} venues`);

const out = { ...LOCAL_PICK_IDS };
let hits = 0, misses = 0;
for (const [key, v] of pending) {
  const anchor = Number.isFinite(v.lat) && Number.isFinite(v.lng)
    ? { lat: v.lat, lng: v.lng, radiusMi: MATCH_RADIUS_MI }
    : (() => { const m = firstMarketFor(key); return m ? { lat: m.lat, lng: m.lng, radiusMi: MARKET_RADIUS_MI } : null; })();
  if (!anchor) { console.log(`  MISS ${key}: no coordinates and no market to bias on`); misses++; continue; }
  const q = `${v.name} ${v.city} Florida`;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.businessStatus",
    },
    body: JSON.stringify({
      textQuery: q,
      maxResultCount: 3,
      locationBias: { circle: { center: { latitude: anchor.lat, longitude: anchor.lng }, radius: 40000 } },
    }),
  }).catch(() => null);
  if (!r || !r.ok) { console.log(`  MISS ${key}: HTTP ${r ? r.status : "network"}`); misses++; continue; }
  const data = await r.json().catch(() => ({}));
  const hit = (data.places || []).find((p) => p && p.id && p.location
    && haversineMi(anchor.lat, anchor.lng, p.location.latitude, p.location.longitude) <= anchor.radiusMi
    && nameMatches(v.name, (p.displayName && p.displayName.text) || ""));
  if (!hit) { console.log(`  MISS ${key}: no verified match for "${q}"`); misses++; continue; }
  // A venue held BECAUSE it is shut must not come back just because Google
  // still lists it. Only OPERATIONAL resolves.
  if (hit.businessStatus && hit.businessStatus !== "OPERATIONAL") {
    console.log(`  HOLD ${key}: ${hit.businessStatus} — not written`);
    misses++; continue;
  }
  out[key] = hit.id;
  hits++;
  console.log(`  OK   ${key} -> ${hit.id} (${(hit.displayName && hit.displayName.text) || "?"})`);
}

if (hits) {
  const path = new URL("../lib/localPickIds.js", import.meta.url).pathname;
  const src = readFileSync(path, "utf8");
  const body = "export const LOCAL_PICK_IDS = " + JSON.stringify(out, null, 2).replace(/"([a-z0-9_]+)":/g, "$1:") + ";\n";
  writeFileSync(path, src.replace(/export const LOCAL_PICK_IDS = [\s\S]*$/, body));
  console.log(`resolve-local-pick-ids: wrote ${hits} id(s) to lib/localPickIds.js`);
}
console.log(`resolve-local-pick-ids: ${hits} resolved, ${misses} still unresolved`);

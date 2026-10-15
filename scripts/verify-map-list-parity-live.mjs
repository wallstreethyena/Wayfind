// scripts/verify-map-list-parity-live.mjs — READ-ONLY production probe: for each
// metro, compare the map's candidate pool (/api/places/map, no 9.2 floor) with
// the list (/api/places/search?inv=1&schema=...) inside the same +-9 km box.
//   node scripts/verify-map-list-parity-live.mjs [--base https://www.gowayfind.com] [--schema mapcoord2] [--out file.json]
// No Google call, no spend: both routes read the owned inventory only.
import { writeFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "https://www.gowayfind.com");
const SCHEMA = arg("--schema", "mapcoord2");
const OUT = arg("--out", null);
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  Referer: `${BASE}/`, Accept: "application/json",
};
const METROS = {
  Tampa: [27.9506, -82.4572], "St. Pete": [27.7676, -82.6403], Sarasota: [27.3364, -82.5307],
  Bradenton: [27.4989, -82.5748], Orlando: [28.5384, -81.3789], Miami: [25.7617, -80.1918],
  Jacksonville: [30.3322, -81.6557], Naples: [26.142, -81.7948], "Key West": [24.5551, -81.78],
  Gainesville: [29.6516, -82.3248],
};
const CATS = ["food", "nightlife", "attractions", "beach", "hotels", "shopping"];
const KM = 9;

async function getJson(url) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) return r.json();
    if (a === 2) throw new Error(`${r.status} ${url}`);
    await new Promise((res) => setTimeout(res, 800 * (a + 1)));
  }
}

async function mapCandidates(lat, lng, b) {
  const out = new Map();
  let cursor = "";
  for (let i = 0; i < 40; i++) {
    const q = new URLSearchParams({ north: b.north, south: b.south, east: b.east, west: b.west, originLat: lat, originLng: lng });
    if (cursor) q.set("cursor", cursor);
    const j = await getJson(`${BASE}/api/places/map?${q}`);
    for (const p of j.places || []) out.set(p.id, p);
    if (!j.nextCursor) return out;
    cursor = j.nextCursor;
  }
  throw new Error("map pagination did not finish");
}

async function listRows(lat, lng, b) {
  const out = new Map();
  for (const cat of CATS) {
    let offset = 0;
    for (let i = 0; i < 30; i++) {
      const u = `${BASE}/api/places/search?q=inventory&lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radius=${KM * 1000}&n=400&cat=${cat}&inv=1&schema=${SCHEMA}${offset ? `&offset=${offset}` : ""}`;
      const j = await getJson(u);
      for (const p of j.places || []) {
        const la = p.location && p.location.latitude, ln = p.location && p.location.longitude;
        if (typeof la === "number" && la >= b.south && la <= b.north && ln >= b.west && ln <= b.east) out.set(p.id, p);
      }
      if (!j.hasMore) break;
      offset = j.nextOffset;
    }
  }
  return out;
}

const report = [];
for (const [metro, [lat, lng]] of Object.entries(METROS)) {
  const dLat = KM / 111.32, dLng = KM / (111.32 * Math.cos((lat * Math.PI) / 180));
  const b = { north: lat + dLat, south: lat - dLat, east: lng + dLng, west: lng - dLng };
  const [map, list] = await Promise.all([mapCandidates(lat, lng, b), listRows(lat, lng, b)]);
  let ok = 0, notOk = 0, unknown = 0, okNotInMap = 0, notOkInMap = 0;
  const bySource = {};
  for (const [id, p] of list) {
    const v = p.mapCoord;
    const inMap = map.has(id);
    if (!v) unknown++;
    else if (v.ok) { ok++; if (!inMap) okNotInMap++; }
    else { notOk++; if (inMap) notOkInMap++; }
  }
  for (const p of map.values()) bySource[p.coordSource || "?"] = (bySource[p.coordSource || "?"] || 0) + 1;
  report.push({ metro, mapCandidates: map.size, listPlaces: list.size, listDrawable: ok, listNoPermittedCoordinate: notOk, listNoVerdict: unknown, drawableButNotInMap: okNotInMap, undrawableButInMap: notOkInMap, mapBySource: bySource });
  console.log(JSON.stringify(report[report.length - 1]));
}
if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, schema: SCHEMA, at: new Date().toISOString(), report }, null, 2));

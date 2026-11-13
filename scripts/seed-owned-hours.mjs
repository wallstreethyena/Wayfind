#!/usr/bin/env node
// scripts/seed-owned-hours.mjs — Mission 7 & 22 Zero-Paid-Spend Owned Hours Hydration.
//
// Hydrates `wf_inventory.signals.owned_hours` at $0 Google API cost from:
//   1. Fresh (<29d, recorded `wrote_at`) `pd1|*` and `pdd1|*` rows in `wf_places_cache`
//      (`source: "google_places"`, strict `expiresAt = wrote_at + 30d`).
//   2. OpenStreetMap Overpass `opening_hours` facts across Florida metros matched
//      conservatively (`<= 45m` haversine distance + normalized significant token match,
//      `source: "openstreetmap"`, ODbL factual schedule, $0 API spend).
//
// Dry-run by default. Pass `--apply` with `WF_PRODUCTION_WRITE_CAPABILITY=ALLOW_EXPLICIT_OPERATOR_WRITE`
// to persist verified snapshots onto `wf_inventory.signals.owned_hours`.

import {
  buildOwnedHoursRecord,
  isUsableOwnedHours,
  parseOsmOpeningHours,
  persistOwnedHoursSnapshot,
} from "../lib/ownedHours.js";

const DAY_MS = 86400000;
const APPLY = process.argv.includes("--apply");
const SKIP_OSM = process.argv.includes("--skip-osm");

const STOP_WORDS = new Set([
  "the", "and", "of", "in", "at", "fl", "florida", "inc", "llc", "co",
  "st", "saint", "fort", "ft", "north", "south", "east", "west", "new",
  "park", "beach", "city", "county", "bar", "grill", "restaurant", "cafe",
]);

function sigTokens(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nameMatchesConservatively(wfName, osmName) {
  const a = String(wfName || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const b = String(osmName || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!a || !b) return false;
  if (a === b || (a.length >= 6 && b.includes(a)) || (b.length >= 6 && a.includes(b))) {
    return true;
  }
  const ta = sigTokens(wfName);
  const tb = new Set(sigTokens(osmName));
  if (!ta.length || !tb.size) return false;
  const shared = ta.filter((t) => tb.has(t));
  if (ta.length === 1 && tb.size === 1) return shared.length === 1;
  return shared.length >= Math.min(2, Math.max(1, Math.min(ta.length, tb.size)));
}

const OSM_UA = "Wayfind/1.0 (+https://www.gowayfind.com; hello@gowayfind.com)";

const FLORIDA_METROS = [
  { name: "tampa_stpete_clearwater", lat: 27.9506, lng: -82.4572, radiusM: 28000 },
  { name: "st_pete_pinellas", lat: 27.7676, lng: -82.6403, radiusM: 22000 },
  { name: "sarasota_bradenton", lat: 27.3364, lng: -82.5307, radiusM: 26000 },
  { name: "orlando_winterpark", lat: 28.5384, lng: -81.3789, radiusM: 28000 },
  { name: "kissimmee_attractions", lat: 28.3420, lng: -81.5300, radiusM: 22000 },
  { name: "miami_beach_coral_gables", lat: 25.7617, lng: -80.1918, radiusM: 25000 },
  { name: "fort_lauderdale_hollywood", lat: 26.1224, lng: -80.1373, radiusM: 22000 },
  { name: "west_palm_boca", lat: 26.7153, lng: -80.0534, radiusM: 24000 },
  { name: "jacksonville_staugustine", lat: 30.3322, lng: -81.6557, radiusM: 26000 },
  { name: "naples_fortmyers", lat: 26.1420, lng: -81.7948, radiusM: 24000 },
  { name: "key_west", lat: 24.5551, lng: -81.7800, radiusM: 15000 },
];

async function fetchAllPostgrest(baseUrl, key, pathAndQuery) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 26000; offset += pageSize) {
    const sep = pathAndQuery.includes("?") ? "&" : "?";
    const r = await fetch(`${baseUrl}/rest/v1/${pathAndQuery}${sep}limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`PostgREST ${r.status} on ${pathAndQuery}`);
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function fetchOverpassElementsForRegion({ lat, lng, radiusM }) {
  const a = `(around:${radiusM},${lat},${lng})`;
  const query =
    `[out:json][timeout:8];(` +
    `nwr["amenity"]["opening_hours"]["name"]${a};` +
    `nwr["shop"]["opening_hours"]["name"]${a};` +
    `nwr["tourism"]["opening_hours"]["name"]${a};` +
    `nwr["leisure"]["opening_hours"]["name"]${a};` +
    `);out center 3000;`;
  const endpoints = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": OSM_UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) continue;
      const txt = await r.text();
      if (!txt.startsWith("{")) continue;
      const j = JSON.parse(txt);
      if (typeof j?.remark === "string" && /runtime error|timed out|out of memory/i.test(j.remark)) continue;
      if (Array.isArray(j?.elements)) return j.elements;
    } catch {
      // try next mirror
    }
  }
  return [];
}

async function main() {
  const rawUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    console.error("seed-owned-hours: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const nowMs = Date.now();
  const cutoffIso = new Date(nowMs - 29 * DAY_MS).toISOString();
  const invRows = await fetchAllPostgrest(
    rawUrl,
    key,
    "wf_inventory?status=eq.OPERATIONAL&excluded=not.is.true&select=place_id,name,lat,lng,signals,locked",
  );

  const byId = new Map();
  let beforeOwnedCount = 0;
  for (const row of invRows) {
    byId.set(row.place_id, row);
    if (isUsableOwnedHours(row?.signals?.owned_hours, nowMs)) beforeOwnedCount++;
  }

  const planned = new Map(); // place_id -> { record, via }
  let fromCache = 0;

  function tryStagePlaceHours(placeId, valObj, wroteMs, viaTag) {
    if (!placeId || !valObj) return;
    const inv = byId.get(placeId);
    if (!inv || isUsableOwnedHours(inv?.signals?.owned_hours, nowMs)) return;
    const existingPlan = planned.get(placeId);
    if (existingPlan && Date.parse(existingPlan.record.verifiedAt) >= wroteMs) return;

    const rawPeriods = valObj?.regularOpeningHours?.periods || null;
    const rawLines = valObj?.regularOpeningHours?.weekdayDescriptions || valObj?.hours || null;
    if (!rawPeriods && (!Array.isArray(rawLines) || !rawLines.length)) return;

    const rec = buildOwnedHoursRecord({
      periods: rawPeriods,
      weekdayDescriptions: rawLines,
      lat: inv.lat,
      lng: inv.lng,
      source: "google_places",
      verifiedAt: new Date(wroteMs).toISOString(),
    });
    if (rec && isUsableOwnedHours(rec, nowMs)) {
      if (!existingPlan) fromCache++;
      planned.set(placeId, { record: rec, via: viaTag });
    }
  }

  // ── Source 1: Fresh (<29d) pd1|*, pdd1|*, v1|*, and v1p|* rows in wf_places_cache ──
  const cacheRows = await fetchAllPostgrest(
    rawUrl,
    key,
    `wf_places_cache?wrote_at=gte.${encodeURIComponent(cutoffIso)}&or=(k.like.pd1%7C*,k.like.pdd1%7C*,k.like.v1%7C*,k.like.v1p%7C*)&select=k,v,wrote_at`,
  );
  for (const cr of cacheRows) {
    if (!cr?.k || !cr?.v || !cr?.wrote_at) continue;
    const wroteMs = Date.parse(cr.wrote_at);
    if (!Number.isFinite(wroteMs) || nowMs - wroteMs < 0 || nowMs - wroteMs >= 29 * DAY_MS) continue;
    const k = String(cr.k);
    if (k.startsWith("pd1|") || k.startsWith("pdd1|")) {
      const placeId = k.replace(/^pdd?1\|/, "");
      tryStagePlaceHours(placeId, cr.v, wroteMs, "wf_places_cache_detail");
    } else if (k.startsWith("v1|") || k.startsWith("v1p|")) {
      const items = Array.isArray(cr.v) ? cr.v : Array.isArray(cr.v?.places) ? cr.v.places : [];
      for (const item of items) {
        const pid = item?.id || item?.place_id;
        if (pid) tryStagePlaceHours(String(pid), item, wroteMs, "wf_places_cache_search");
      }
    }
  }

  // ── Source 2: OpenStreetMap Overpass Florida `opening_hours` facts ($0 spend) ──
  let fromOsm = 0;
  let osmElementsTotal = 0;
  if (!SKIP_OSM) {
    const grid = new Map();
    const cellKey = (lat, lng) => `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
    for (const inv of invRows) {
      if (!Number.isFinite(inv.lat) || !Number.isFinite(inv.lng)) continue;
      if (isUsableOwnedHours(inv?.signals?.owned_hours, nowMs) || planned.has(inv.place_id)) continue;
      const ck = cellKey(inv.lat, inv.lng);
      const list = grid.get(ck) || [];
      list.push(inv);
      grid.set(ck, list);
    }

    for (const region of FLORIDA_METROS) {
      const elements = await fetchOverpassElementsForRegion(region);
      osmElementsTotal += elements.length;
      for (const el of elements) {
        const elLat = Number.isFinite(el.lat) ? el.lat : el.center?.lat;
        const elLng = Number.isFinite(el.lon) ? el.lon : el.center?.lon;
        const osmName = el.tags?.name;
        const osmOh = el.tags?.opening_hours;
        if (!Number.isFinite(elLat) || !Number.isFinite(elLng) || !osmName || !osmOh) continue;

        const parsed = parseOsmOpeningHours(osmOh);
        if (!parsed) continue;

        const baseLat = Math.floor(elLat * 100);
        const baseLng = Math.floor(elLng * 100);
        let bestInv = null;
        let bestDist = 45.0;

        for (let dLat = -1; dLat <= 1; dLat++) {
          for (let dLng = -1; dLng <= 1; dLng++) {
            const bucket = grid.get(`${baseLat + dLat}:${baseLng + dLng}`);
            if (!bucket) continue;
            for (const cand of bucket) {
              if (planned.has(cand.place_id)) continue;
              const dist = haversineM(elLat, elLng, cand.lat, cand.lng);
              if (dist <= bestDist && nameMatchesConservatively(cand.name, osmName)) {
                bestDist = dist;
                bestInv = cand;
              }
            }
          }
        }

        if (bestInv) {
          const rec = buildOwnedHoursRecord({
            periods: parsed.periods,
            weekdayDescriptions: parsed.weekdayDescriptions,
            lat: bestInv.lat,
            lng: bestInv.lng,
            source: "openstreetmap",
            verifiedAt: new Date(nowMs).toISOString(),
          });
          if (rec && isUsableOwnedHours(rec, nowMs)) {
            planned.set(bestInv.place_id, { record: rec, via: `osm:${region.name}` });
            fromOsm++;
          }
        }
      }
    }
  }

  let persisted = 0;
  let failed = 0;
  if (APPLY && planned.size > 0) {
    const entries = [...planned.entries()];
    const concurrency = 16;
    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < entries.length) {
        const current = entries[idx++];
        if (!current) break;
        const [placeId, item] = current;
        const res = await persistOwnedHoursSnapshot(placeId, item.record, { nowMs });
        if (res.persisted) persisted++;
        else failed++;
      }
    });
    await Promise.all(workers);
  }

  // Re-verify live count if applied
  let afterOwnedCount = beforeOwnedCount;
  if (APPLY && (persisted > 0 || beforeOwnedCount > 0)) {
    const postRows = await fetchAllPostgrest(
      rawUrl,
      key,
      "wf_inventory?status=eq.OPERATIONAL&excluded=not.is.true&select=place_id,signals",
    );
    afterOwnedCount = postRows.filter((r) => isUsableOwnedHours(r?.signals?.owned_hours, nowMs)).length;
  }

  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    googleApiCalls: 0,
    paidSpendUsd: 0,
    totalOperationalInventory: invRows.length,
    beforeOwnedHoursCount: beforeOwnedCount,
    beforeOwnedHoursPct: Number(((beforeOwnedCount / Math.max(1, invRows.length)) * 100).toFixed(2)),
    candidatesHydrated: {
      total: planned.size,
      fromFreshPlacesCache: fromCache,
      fromOpenStreetMapOverpass: fromOsm,
      osmElementsScanned: osmElementsTotal,
    },
    persisted,
    failed,
    afterOwnedHoursCount: APPLY ? afterOwnedCount : beforeOwnedCount + planned.size,
    afterOwnedHoursPct: Number(
      (((APPLY ? afterOwnedCount : beforeOwnedCount + planned.size) / Math.max(1, invRows.length)) * 100).toFixed(2),
    ),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("seed-owned-hours: FAIL -", err?.message || err);
  process.exit(1);
});

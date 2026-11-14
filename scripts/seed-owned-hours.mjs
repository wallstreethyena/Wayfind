#!/usr/bin/env node
// scripts/seed-owned-hours.mjs — Mission 7 & 22 Zero-Paid-Spend Owned Hours Hydration.
//
// Hydrates `wf_inventory.signals.owned_hours` at $0 Google API cost from:
//   1. Wayfind-owned repository facts (`data/atlas/editorial-cards.json`,
//      `data/owned-place-truth.json`, and `data/christmas-2026-research.json`).
//   2. Fresh (<29d, recorded `wrote_at`) `pd1|*` and `pdd1|*` rows in `wf_places_cache`
//      (`source: "google_places"`, strict `expiresAt = wrote_at + 30d`).
//   3. OpenStreetMap Overpass `opening_hours` facts across Florida metros matched
//      conservatively (`<= 45m` haversine distance + normalized significant token match,
//      `source: "openstreetmap"`, ODbL factual schedule, $0 API spend).
//
// Dry-run by default (ZERO production DB writes, ZERO paid API calls).
// Pass `--cohort-report` to display the exact Before vs After High-Demand Florida Cohort report.
// Pass `--apply` with `WF_PRODUCTION_WRITE_CAPABILITY=ALLOW_EXPLICIT_OPERATOR_WRITE`
// to persist verified snapshots onto `wf_inventory.signals.owned_hours`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildOwnedHoursRecord,
  isUsableOwnedHours,
  parseOsmOpeningHours,
  parseWeekdayDescriptionsToPeriods,
  persistOwnedHoursSnapshot,
  resolveOwnedHoursSnapshot,
  shouldReplaceOwnedHours,
  evaluateOwnedHoursStatus,
  getOwnedHoursIndex,
} from "../lib/ownedHours.js";

const DAY_MS = 86400000;
const APPLY = process.argv.includes("--apply");
const COHORT_REPORT = process.argv.includes("--cohort-report");
const JSON_OUT = process.argv.includes("--json");
const SKIP_OSM = process.argv.includes("--skip-osm") || COHORT_REPORT;

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

/**
 * Builds the fixed, reproducible High-Demand Florida Cohort combining
 * operational/curated places in Tampa Bay, Sarasota/Bradenton, Orlando, and active Christmas destinations.
 */
export function buildHighDemandFloridaCohort() {
  const cohort = new Map();

  // 1. Atlas curated cards (data/atlas/editorial-cards.json)
  try {
    const raw = readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8");
    const cards = JSON.parse(raw);
    for (const c of Array.isArray(cards) ? cards : []) {
      if (!c?.placeId) continue;
      cohort.set(c.placeId, {
        place_id: c.placeId,
        name: c.name || "",
        locality: c.address || "",
        category: c.category || "",
        sourceFile: "atlas_editorial_cards",
      });
    }
  } catch {}

  // 2. First-party actions (data/first-party-actions.json)
  try {
    const raw = readFileSync(new URL("../data/first-party-actions.json", import.meta.url), "utf8");
    const actions = JSON.parse(raw);
    for (const [pid, p] of Object.entries(actions.places || {})) {
      if (!pid) continue;
      const cur = cohort.get(pid) || { place_id: pid, sourceFile: "first_party_actions" };
      cur.name = cur.name || p.name || "";
      if (p.locality) cur.locality = p.locality;
      cohort.set(pid, cur);
    }
  } catch {}

  // 3. Priority place IDs (data/atlas/priority-place-ids.json)
  try {
    const raw = readFileSync(new URL("../data/atlas/priority-place-ids.json", import.meta.url), "utf8");
    for (const pid of JSON.parse(raw)) {
      if (!pid) continue;
      if (!cohort.has(pid)) {
        cohort.set(pid, { place_id: pid, sourceFile: "priority_place_ids" });
      }
    }
  } catch {}

  // 4. Anchors (data/anchors.json)
  try {
    const raw = readFileSync(new URL("../data/anchors.json", import.meta.url), "utf8");
    const anchors = JSON.parse(raw);
    for (const arr of Object.values(anchors)) {
      if (Array.isArray(arr)) {
        for (const a of arr) {
          if (a?.place_id) {
            const cur = cohort.get(a.place_id) || { place_id: a.place_id, sourceFile: "anchors" };
            cur.name = cur.name || a.name || "";
            if (a.city) cur.locality = a.city;
            cohort.set(a.place_id, cur);
          }
        }
      }
    }
  } catch {}

  // 5. Christmas research (data/christmas-2026-research.json — confirmed_dated only)
  try {
    const raw = readFileSync(new URL("../data/christmas-2026-research.json", import.meta.url), "utf8");
    const xms = JSON.parse(raw);
    for (const x of Array.isArray(xms) ? xms : []) {
      if (x?.place_id && x.state === "confirmed_dated") {
        const cur = cohort.get(x.place_id) || { place_id: x.place_id, sourceFile: "christmas_research" };
        cur.name = cur.name || x.venue_name || x.event_name || "";
        cur.isChristmas = true;
        cur.city = x.city;
        cur.region = x.region;
        cohort.set(x.place_id, cur);
      }
    }
  } catch {}

  return cohort;
}

export function classifyCohortMarket(item) {
  if (item.isChristmas) return "Christmas";
  const text = `${item.name || ""} ${item.locality || ""} ${item.city || ""} ${item.region || ""}`.toLowerCase();
  if (
    /sarasota|bradenton|anna maria|holmes beach|siesta|venice|longboat|lakewood ranch|osprey|nokomis|palmetto|cortez|ellenton|myakka/i.test(text)
  ) {
    return "Sarasota/Bradenton";
  }
  if (
    /tampa|st\.?\s*pete|clearwater|ybor|brandon|pinellas|hillsborough|dunedin|largo|safety harbor/i.test(text)
  ) {
    return "Tampa Bay";
  }
  if (
    /orlando|winter park|kissimmee|bay lake|lake buena vista|disney|universal|altamonte|sanford|eustis|mount dora/i.test(text)
  ) {
    return "Orlando";
  }
  return "Other FL";
}

/**
 * Generate comprehensive Before vs After cohort coverage report.
 */
export async function generateCohortReport({ env = process.env, nowMs = Date.now() } = {}) {
  const cohort = buildHighDemandFloridaCohort();
  const rawUrl = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;

  const invByPid = new Map();
  const cacheHoursByPid = new Map();
  if (rawUrl && key) {
    // Read-only batch fetch for cohort places from wf_inventory
    const pids = [...cohort.keys()];
    const batchSize = 80;
    for (let i = 0; i < pids.length; i += batchSize) {
      const slice = pids.slice(i, i + batchSize);
      const q = slice.map((id) => `"${id}"`).join(",");
      try {
        const r = await fetch(
          `${rawUrl}/rest/v1/wf_inventory?place_id=in.(${encodeURIComponent(q)})&select=place_id,signals,lat,lng,locality,name`,
          {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (r.ok) {
          const rows = await r.json();
          if (Array.isArray(rows)) {
            for (const row of rows) {
              if (row?.place_id) invByPid.set(row.place_id, row);
            }
          }
        }
      } catch {}
    }

    // Read-only fetch for fresh (<29d) cached place details from wf_places_cache
    const cutoffIso = new Date(nowMs - 29 * DAY_MS).toISOString();
    try {
      const cacheRows = await fetchAllPostgrest(
        rawUrl,
        key,
        `wf_places_cache?k=like.pd1%25&wrote_at=gte.${encodeURIComponent(cutoffIso)}&select=k,v,wrote_at`,
      );
      for (const cr of cacheRows) {
        if (!cr?.k || !cr?.wrote_at) continue;
        const wroteMs = Date.parse(cr.wrote_at);
        if (!Number.isFinite(wroteMs) || nowMs - wroteMs < 0 || nowMs - wroteMs >= 29 * DAY_MS) continue;
        const pid = String(cr.k).replace(/^pd1\|/, "");
        const rawHours = cr.v?.hours || cr.v?.regularOpeningHours?.weekdayDescriptions || null;
        if (!Array.isArray(rawHours) || !rawHours.length) continue;
        const parsed = parseWeekdayDescriptionsToPeriods(rawHours);
        if (!parsed) continue;
        const rec = buildOwnedHoursRecord({
          periods: parsed.periods,
          weekdayDescriptions: parsed.weekdayDescriptions,
          source: "google_places",
          verifiedAt: new Date(wroteMs).toISOString(),
          expiresAt: new Date(wroteMs + 30 * DAY_MS).toISOString(),
        });
        if (rec && isUsableOwnedHours(rec, nowMs)) {
          cacheHoursByPid.set(pid, rec);
        }
      }
    } catch {}
  }

  // Pre-load zero-network Wayfind owned-hours index
  getOwnedHoursIndex();

  const markets = ["Sarasota/Bradenton", "Christmas", "Tampa Bay", "Orlando", "Other FL"];
  const marketStats = Object.fromEntries(
    markets.map((m) => [m, { total: 0, beforeCovered: 0, afterCovered: 0 }]),
  );

  const sourceCounts = {};
  const confidenceCounts = {};
  let minVerifiedAt = null;
  let maxVerifiedAt = null;
  let beforeTotal = 0;
  let afterTotal = 0;

  for (const [pid, item] of cohort) {
    const inv = invByPid.get(pid);
    if (inv) {
      if (inv.locality && !item.locality) item.locality = inv.locality;
      if (inv.name && !item.name) item.name = inv.name;
      item.lat = inv.lat;
      item.lng = inv.lng;
    }

    const market = classifyCohortMarket(item);
    item.market = market;
    if (marketStats[market]) marketStats[market].total++;

    // Before state from inventory
    const existingOh = inv?.signals?.owned_hours;
    const hasBefore = isUsableOwnedHours(existingOh, nowMs);
    if (hasBefore) {
      beforeTotal++;
      if (marketStats[market]) marketStats[market].beforeCovered++;
    }

    // Candidate from fresh cache (source: "google_places", <30d ToS)
    const cacheRec = cacheHoursByPid.get(pid) || null;
    let bestExisting = existingOh;
    if (cacheRec && shouldReplaceOwnedHours(existingOh, cacheRec, nowMs)) {
      bestExisting = cacheRec;
    }

    // After state from zero-network resolution + fresh cache fallback
    const resolved = resolveOwnedHoursSnapshot(pid, {
      existingOwnedHours: bestExisting,
      lat: item.lat,
      lng: item.lng,
      placeName: item.name,
      nowMs,
    });
    const finalAfter = (resolved && isUsableOwnedHours(resolved, nowMs))
      ? resolved
      : (cacheRec && isUsableOwnedHours(cacheRec, nowMs) ? cacheRec : null);

    const hasAfter = Boolean(finalAfter);
    if (hasAfter) {
      afterTotal++;
      if (marketStats[market]) marketStats[market].afterCovered++;
      const src = finalAfter.source || "unknown";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;

      const evalStatus = evaluateOwnedHoursStatus(finalAfter, nowMs);
      const conf = evalStatus.confidence || "unknown";
      confidenceCounts[conf] = (confidenceCounts[conf] || 0) + 1;

      if (finalAfter.verifiedAt) {
        if (!minVerifiedAt || finalAfter.verifiedAt < minVerifiedAt) minVerifiedAt = finalAfter.verifiedAt;
        if (!maxVerifiedAt || finalAfter.verifiedAt > maxVerifiedAt) maxVerifiedAt = finalAfter.verifiedAt;
      }
    } else {
      sourceCounts["unknown"] = (sourceCounts["unknown"] || 0) + 1;
      confidenceCounts["unknown"] = (confidenceCounts["unknown"] || 0) + 1;
    }
  }

  const total = cohort.size;
  const beforePct = Number(((beforeTotal / Math.max(1, total)) * 100).toFixed(2));
  const afterPct = Number(((afterTotal / Math.max(1, total)) * 100).toFixed(2));

  return {
    cohortSize: total,
    beforeCoveredCount: beforeTotal,
    beforeCoveredPct: beforePct,
    afterCoveredCount: afterTotal,
    afterCoveredPct: afterPct,
    netGain: afterTotal - beforeTotal,
    marketBreakdown: Object.fromEntries(
      markets.map((m) => {
        const s = marketStats[m];
        return [
          m,
          {
            total: s.total,
            beforeCovered: s.beforeCovered,
            beforePct: Number(((s.beforeCovered / Math.max(1, s.total)) * 100).toFixed(2)),
            afterCovered: s.afterCovered,
            afterPct: Number(((s.afterCovered / Math.max(1, s.total)) * 100).toFixed(2)),
            netGain: s.afterCovered - s.beforeCovered,
          },
        ];
      }),
    ),
    sourceBreakdown: sourceCounts,
    confidenceBreakdown: confidenceCounts,
    verifiedAtRange: {
      earliest: minVerifiedAt,
      latest: maxVerifiedAt,
    },
  };
}

function formatCohortTable(report) {
  const lines = [];
  lines.push("========================================================================================");
  lines.push("WAYFIND ZERO-SPEND HIGH-DEMAND FLORIDA OWNED-HOURS COHORT REPORT");
  lines.push("========================================================================================");
  lines.push(`Mode: ${APPLY ? "apply" : "dry-run (ZERO production DB writes, ZERO paid API calls)"}`);
  lines.push(`Total Cohort Places: ${report.cohortSize}`);
  lines.push(
    `Overall Before Coverage: ${report.beforeCoveredCount} / ${report.cohortSize} (${report.beforeCoveredPct}%)`,
  );
  lines.push(
    `Overall After Coverage:  ${report.afterCoveredCount} / ${report.cohortSize} (${report.afterCoveredPct}%) [Net Gain: +${report.netGain} places (+${(report.afterCoveredPct - report.beforeCoveredPct).toFixed(2)}%)]`,
  );
  lines.push("");
  lines.push("MARKET BREAKDOWN:");
  lines.push("| Market             | Total | Before Covered | Before % | After Covered | After % | Net Gain |");
  lines.push("|--------------------|-------|----------------|----------|---------------|---------|----------|");
  for (const [market, s] of Object.entries(report.marketBreakdown)) {
    const padM = market.padEnd(18, " ");
    const padTot = String(s.total).padStart(5, " ");
    const padBfC = String(s.beforeCovered).padStart(14, " ");
    const padBfP = `${s.beforePct.toFixed(2)}%`.padStart(8, " ");
    const padAfC = String(s.afterCovered).padStart(13, " ");
    const padAfP = `${s.afterPct.toFixed(2)}%`.padStart(7, " ");
    const padGain = `+${s.netGain}`.padStart(8, " ");
    lines.push(`| ${padM} | ${padTot} | ${padBfC} | ${padBfP} | ${padAfC} | ${padAfP} | ${padGain} |`);
  }
  lines.push("");
  lines.push("SOURCE BREAKDOWN:");
  for (const [src, cnt] of Object.entries(report.sourceBreakdown)) {
    lines.push(`- ${src}: ${cnt}`);
  }
  lines.push("");
  lines.push("CONFIDENCE BREAKDOWN:");
  for (const [conf, cnt] of Object.entries(report.confidenceBreakdown)) {
    lines.push(`- ${conf}: ${cnt}`);
  }
  lines.push("");
  lines.push("VERIFIED AT TIMESTAMP RANGE:");
  lines.push(`- Earliest: ${report.verifiedAtRange.earliest || "none"}`);
  lines.push(`- Latest:   ${report.verifiedAtRange.latest || "none"}`);
  lines.push("========================================================================================");
  return lines.join("\n");
}

async function main() {
  const nowMs = Date.now();

  // If user requested cohort report, run dry-run report and exit immediately
  if (COHORT_REPORT) {
    const report = await generateCohortReport({ env: process.env, nowMs });
    if (JSON_OUT) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatCohortTable(report));
    }
    return;
  }

  const rawUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    console.error("seed-owned-hours: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

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
  let fromRepo = 0;
  let fromCache = 0;

  // ── Source 0: Wayfind-owned repository facts (Atlas cards, owned truth, Christmas research) ──
  getOwnedHoursIndex();
  for (const row of invRows) {
    if (isUsableOwnedHours(row?.signals?.owned_hours, nowMs)) continue;
    const snap = resolveOwnedHoursSnapshot(row.place_id, {
      lat: row.lat,
      lng: row.lng,
      placeName: row.name,
      nowMs,
    });
    if (snap && isUsableOwnedHours(snap, nowMs)) {
      planned.set(row.place_id, { record: snap, via: `repo:${snap.source}` });
      fromRepo++;
    }
  }

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
      expiresAt: new Date(wroteMs + 30 * DAY_MS).toISOString(),
    });
    if (rec && isUsableOwnedHours(rec, nowMs)) {
      if (!existingPlan) fromCache++;
      planned.set(placeId, { record: rec, via: viaTag });
    }
  }

  // ── Source 1: Fresh (<29d) pd1|* rows in wf_places_cache ──
  const cacheRows = await fetchAllPostgrest(
    rawUrl,
    key,
    `wf_places_cache?k=like.pd1%25&wrote_at=gte.${encodeURIComponent(cutoffIso)}&select=k,v,wrote_at`,
  );
  for (const cr of cacheRows) {
    if (!cr?.k || !cr?.v || !cr?.wrote_at) continue;
    const wroteMs = Date.parse(cr.wrote_at);
    if (!Number.isFinite(wroteMs) || nowMs - wroteMs < 0 || nowMs - wroteMs >= 29 * DAY_MS) continue;
    const placeId = String(cr.k).replace(/^pdd?1\|/, "");
    tryStagePlaceHours(placeId, cr.v, wroteMs, "wf_places_cache_detail");
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
      fromWayfindOwnedRepo: fromRepo,
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

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main().catch((err) => {
    console.error("seed-owned-hours: FAIL -", err?.message || err);
    process.exit(1);
  });
}

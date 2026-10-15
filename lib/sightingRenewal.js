// lib/sightingRenewal.js — THE ONE RULE SET for copying a recorded Google
// sighting (wf_place_ids lat/lng + seen_at) into wf_inventory.independent_coords.
//
// Shared by scripts/backfill-coords-from-place-sightings.mjs (the one-off SQL
// pass, #1806) and app/api/cron/sighting-renewal (the daily zero-cost job that
// keeps those sightings current). Both read their thresholds, exclusions and
// entry shape from here, so the two can never drift apart.
//
// WHY A DAILY JOB (2026-10-15 audit). 2,674 of the 3,652 map-drawable rows were
// drawable ONLY through a sighting entry. A sighting is Google content: it may be
// drawn for 30 days from seen_at and must then be deleted (Google Maps Platform
// Service Specific Terms, Places caching; see lib/coordProvenance.js). Every one
// of those entries expires by 2026-11-13 and nothing renewed them. Fresh
// sightings keep arriving at zero cost: lib/serverCache.upsertPlaceIds stamps
// wf_place_ids.seen_at = now right after every live Google searchText triggered
// by a real user search. This job only copies what is already in our database.
// It makes NO Google call of any kind.
//
// THE RULES (identical for script and cron):
//   * the row: status null/OPERATIONAL, not excluded, not needs_review, and its
//     own Google coordinate is past its window (refreshed_at null or > 30 d);
//   * the sighting: seen_at within the last 30 days and not in the future;
//     lat/lng present, not 0/0, inside the Florida bbox. The bbox is a SCOPE
//     rule kept from the backfill, not a correctness one: measured 2026-10-15,
//     its only effect is 559 out-of-state inventory rows (stored coordinate
//     also outside Florida, 556 within 50 m of their sighting). Widening the
//     served area is a deliberate change to FLORIDA_BBOX, nowhere else;
//   * the id: not a repo seed id and not an Atlas allowlist id (their seen_at
//     is a script run time, not a Google observation);
//   * consistency: the row must hold a stored coordinate and the sighting must
//     be within 50 m of it. The stored coordinate is a CHECK ONLY and is never
//     copied; the entry always carries the sighting's own lat/lng;
//   * the entry: source google_places, method wf_place_ids-sighting,
//     observed_at = seen_at (truncated to milliseconds, so never later).
//
// WRITES: a row's existing wf_place_ids-sighting entry is replaced only by a
// strictly newer sighting; entries from any other method (Wikidata, official
// venue, OSM, ...) are never touched. An expired sighting entry is removed
// (Google requires deleting expired lat/lng); a row left with no entries goes
// back to NULL.
import { readFileSync } from "node:fs";
import path from "node:path";
import { GOOGLE_COORD_MAX_AGE_DAYS, SIGHTING_METHOD, DAY_MS } from "./coordProvenance.js";

export { SIGHTING_METHOD };
export const SIGHTING_SOURCE = "google_places";
export const SIGHTING_MAX_AGE_DAYS = GOOGLE_COORD_MAX_AGE_DAYS;
export const CONSISTENCY_MAX_M = 50;
export const FLORIDA_BBOX = Object.freeze({ latMin: 24.3, latMax: 31.1, lngMin: -87.7, lngMax: -79.8 });

// Repo files that hand-insert wf_place_ids rows (seen_at = seed run time).
// Their ids are parsed into SEED_IDS_FILE; scripts/test-sighting-renewal.mjs
// re-parses these files and requires the committed list to match exactly.
export const SEED_FILES = Object.freeze([
  "scripts/data/owner-reels-2026-09-02.sql", "scripts/data/fall-venue-identities-2026-09-03.sql",
  "scripts/data/nostalgia-archive-2026-09-02.sql", "scripts/data/pintos-farm-identity-2026-09-22.sql",
  "scripts/ingest-verified-2026-08-26.mjs", "scripts/ingest-verified-2026-08-27.mjs", "scripts/ingest-verified-2026-08-28.mjs",
  "scripts/ingest-verified-2026-08-29.mjs", "scripts/ingest-verified-2026-08-29e.mjs",
]);
export const SEED_IDS_FILE = "data/coords/sighting-seed-place-ids.json";
export const PLACE_ID_RE = /ChIJ[A-Za-z0-9_-]{20,}/g;

// Literal cwd path so Next's file tracer ships the JSON with the cron.
export function loadSeedIds() {
  const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), "data/coords/sighting-seed-place-ids.json"), "utf8"));
  if (!raw || !Array.isArray(raw.ids) || !raw.ids.length) throw new Error("sightingRenewal: seed id list is empty");
  return raw.ids;
}

// Seed ids + Atlas allowlist ids. Atlas is imported lazily: it reads its card
// files at import time and only server callers need it.
export async function loadExcludedIds() {
  const { listPublishReadyAtlasIds } = await import("./atlasPlaceAllowlist.js");
  const out = new Set(loadSeedIds());
  for (const id of listPublishReadyAtlasIds()) out.add(id);
  return out;
}

export function inFlorida(lat, lng) {
  return lat >= FLORIDA_BBOX.latMin && lat <= FLORIDA_BBOX.latMax && lng >= FLORIDA_BBOX.lngMin && lng <= FLORIDA_BBOX.lngMax;
}

export function haversineM(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

const num = (v) => (typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v));

// seen_at -> observed_at. Truncated (never rounded) to milliseconds, so the
// stored observation time is never later than the database's seen_at.
export function observedAtFromSeenAt(seenAt) {
  const s = String(seenAt == null ? "" : seenAt).trim();
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s);
  if (!m) return null;
  const frac = (m[3] || "").slice(0, 3).padEnd(3, "0");
  let tz = m[4] || "Z";
  if (/^[+-]\d{2}$/.test(tz)) tz += ":00";
  else if (/^[+-]\d{4}$/.test(tz)) tz = tz.slice(0, 3) + ":" + tz.slice(3);
  const ms = Date.parse(`${m[1]}T${m[2]}.${frac}${tz}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Why a wf_place_ids row may not be used as a sighting right now (null = usable).
export function sightingRejection(w, now = Date.now(), excluded = null) {
  if (!w || !w.place_id) return "missing";
  if (excluded && excluded.has(w.place_id)) return "seed-or-atlas-id";
  const lat = num(w.lat), lng = num(w.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "bad-coordinate";
  if (lat === 0 && lng === 0) return "bad-coordinate";
  if (!inFlorida(lat, lng)) return "outside-florida";
  const obs = observedAtFromSeenAt(w.seen_at);
  if (!obs) return "undated";
  const t = Date.parse(obs);
  if (t > now) return "future-dated";
  if (now - t > SIGHTING_MAX_AGE_DAYS * DAY_MS) return "expired";
  return null;
}

// Why an inventory row may not RECEIVE a new sighting entry (null = eligible).
export function rowRejection(row, now = Date.now()) {
  if (!row) return "missing-row";
  if (!(row.status == null || row.status === "OPERATIONAL")) return "not-operational";
  if (row.excluded === true) return "excluded";
  if (row.needs_review === true) return "needs-review";
  if (row.refreshed_at != null) {
    const r = Date.parse(row.refreshed_at);
    if (Number.isFinite(r) && r >= now - SIGHTING_MAX_AGE_DAYS * DAY_MS) return "own-coordinate-fresh";
  }
  const lat = num(row.lat), lng = num(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "no-inventory-coordinate";
  return null;
}

export function sightingEntry(w) {
  return {
    source: SIGHTING_SOURCE, lat: num(w.lat), lng: num(w.lng),
    observed_at: observedAtFromSeenAt(w.seen_at),
    method: SIGHTING_METHOD, attribution: null, verified: false,
  };
}

const isSightingEntry = (e) => !!e && typeof e === "object" && e.method === SIGHTING_METHOD;
export function sightingEntryExpired(e, now = Date.now()) {
  const t = Date.parse(e && e.observed_at);
  return !Number.isFinite(t) || t > now || now - t > SIGHTING_MAX_AGE_DAYS * DAY_MS;
}

// Decide what to do with ONE inventory row given the freshest wf_place_ids
// sighting for its place_id (or null). Pure.
//   { action: "write",  kind: "renew"|"add", next, entry }
//   { action: "remove", next }               expired sighting entries dropped
//   { action: "none",   reason }
export function planRow(row, sighting, { now = Date.now(), excluded = null } = {}) {
  const coords = Array.isArray(row && row.independent_coords) ? row.independent_coords : [];
  const others = coords.filter((e) => !isSightingEntry(e));
  const existing = coords.filter(isSightingEntry);
  const live = existing.filter((e) => !sightingEntryExpired(e, now));
  const newestExisting = existing.reduce((m, e) => Math.max(m, Date.parse(e.observed_at) || 0), 0);

  let reason = sighting ? sightingRejection(sighting, now, excluded) || rowRejection(row, now) : "no-fresh-sighting";
  if (!reason) {
    const d = haversineM(num(row.lat), num(row.lng), num(sighting.lat), num(sighting.lng));
    if (!(d <= CONSISTENCY_MAX_M)) reason = "over-50m";
  }
  if (!reason) {
    const entry = sightingEntry(sighting);
    if (Date.parse(entry.observed_at) > newestExisting) {
      return { action: "write", kind: existing.length ? "renew" : "add", entry, next: [...others, entry] };
    }
    reason = "not-newer";
  }
  if (live.length < existing.length) {
    const next = [...others, ...live];
    return { action: "remove", reason, next: next.length ? next : null };
  }
  return { action: "none", reason };
}

// SQL fragments for the one-off backfill script, built from the SAME
// constants. `seeds` is a CTE of excluded ids; aliases i = wf_inventory,
// w = wf_place_ids.
export function sqlRules() {
  const b = FLORIDA_BBOX;
  const DIST = `2*6371000*asin(sqrt(power(sin(radians(w.lat-i.lat)/2),2)+cos(radians(i.lat))*cos(radians(w.lat))*power(sin(radians(w.lng-i.lng)/2),2)))`;
  const days = `interval '${SIGHTING_MAX_AGE_DAYS} days'`;
  const FL = `(w.lat between ${b.latMin} and ${b.latMax} and w.lng between ${b.lngMin} and ${b.lngMax})`;
  return {
    DIST, FL, METHOD: SIGHTING_METHOD, SOURCE: SIGHTING_SOURCE, MAX_M: CONSISTENCY_MAX_M,
    BASE: `from public.wf_inventory i join public.wf_place_ids w on w.place_id = i.place_id
  where (i.status is null or i.status = 'OPERATIONAL') and coalesce(i.excluded,false) = false and coalesce(i.needs_review,false) = false
    and (i.refreshed_at is null or i.refreshed_at < now() - ${days})
    and w.seen_at >= now() - ${days} and w.seen_at <= now()`,
    SANE: `w.lat is not null and w.lng is not null and not (w.lat = 0 and w.lng = 0)
    and ${FL}
    and w.place_id not in (select id from seeds)`,
    NEAR: `i.lat is not null and i.lng is not null and ${DIST} <= ${CONSISTENCY_MAX_M}`,
  };
}

// ── the cron runner (PostgREST over fetch; injectable for hermetic tests) ──

const enc = encodeURIComponent;
const INV_COLS = "place_id,lat,lng,status,excluded,needs_review,refreshed_at,independent_coords";

export async function runSightingRenewal({
  sb, fetchImpl = fetch, now = Date.now(), excluded, maxWrites = 800, deadlineAt = Infinity,
  pageSize = 1000, idChunk = 150, clock = () => Date.now(),
} = {}) {
  if (!sb || !sb.url || !sb.key) throw new Error("no Supabase env");
  if (!(excluded instanceof Set)) throw new Error("excluded id set required");
  const H = { apikey: sb.key, authorization: "Bearer " + sb.key };
  const get = async (q) => {
    const r = await fetchImpl(`${sb.url}/rest/v1/${q}`, { cache: "no-store", signal: AbortSignal.timeout(20000), headers: H });
    if (!r.ok) throw new Error(`read HTTP ${r.status}: ${q.split("?")[0]}`);
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`read non-array: ${q.split("?")[0]}`);
    return j;
  };
  const stats = {
    sightingsFresh: 0, sightingsUsable: 0, rowsWithEntry: 0, rowsJudged: 0,
    renewed: 0, added: 0, expiredRemoved: 0, conflicts: 0, writeFailed: 0, deferred: 0,
    skipped: {}, sightingRejected: {},
  };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

  // 1. fresh sightings (keyset paged on place_id).
  const since = new Date(now - SIGHTING_MAX_AGE_DAYS * DAY_MS).toISOString();
  const until = new Date(now).toISOString();
  const usable = new Map();
  for (let after = ""; ;) {
    const page = await get(`wf_place_ids?select=place_id,lat,lng,seen_at&seen_at=gte.${enc(since)}&seen_at=lte.${enc(until)}`
      + (after ? `&place_id=gt.${enc(after)}` : "") + `&order=place_id.asc&limit=${pageSize}`);
    for (const w of page) {
      stats.sightingsFresh++;
      const why = sightingRejection(w, now, excluded);
      if (why) bump(stats.sightingRejected, why); else usable.set(w.place_id, w);
    }
    if (page.length < pageSize) break;
    after = page[page.length - 1].place_id;
  }
  stats.sightingsUsable = usable.size;

  // 2. every row that already carries a sighting entry (renew or expire it).
  const rows = new Map();
  const cs = enc(JSON.stringify([{ method: SIGHTING_METHOD }]));
  for (let after = ""; ;) {
    const page = await get(`wf_inventory?select=${INV_COLS}&independent_coords=cs.${cs}`
      + (after ? `&place_id=gt.${enc(after)}` : "") + `&order=place_id.asc&limit=${pageSize}`);
    for (const r of page) rows.set(r.place_id, r);
    if (page.length < pageSize) break;
    after = page[page.length - 1].place_id;
  }
  stats.rowsWithEntry = rows.size;

  // 3. rows that could receive a first entry from a usable sighting.
  const need = [...usable.keys()].filter((id) => !rows.has(id));
  for (let i = 0; i < need.length; i += idChunk) {
    const ids = need.slice(i, i + idChunk).map((id) => `"${id}"`).join(",");
    for (const r of await get(`wf_inventory?select=${INV_COLS}&place_id=in.(${enc(ids)})`)) rows.set(r.place_id, r);
  }

  // 4. plan. Compliance removals first, then renewals soonest-to-expire first, then adds.
  const plans = [];
  for (const row of rows.values()) {
    stats.rowsJudged++;
    const p = planRow(row, usable.get(row.place_id) || null, { now, excluded });
    if (p.action === "none") { bump(stats.skipped, p.reason); continue; }
    const cur = (Array.isArray(row.independent_coords) ? row.independent_coords : []).filter(isSightingEntry);
    const oldest = cur.reduce((m, e) => Math.min(m, Date.parse(e.observed_at) || 0), Infinity);
    const rank = p.action === "remove" ? 0 : p.kind === "renew" ? 1 : 2;
    plans.push({ row, p, rank, oldest });
  }
  plans.sort((a, b) => a.rank - b.rank || a.oldest - b.oldest || (a.row.place_id < b.row.place_id ? -1 : 1));

  // 5. compare-and-swap writes: the PATCH matches only if independent_coords is
  //    still exactly what was judged, so a concurrent writer is never clobbered.
  let attempted = 0;
  for (const { row, p } of plans) {
    if (attempted >= maxWrites || clock() >= deadlineAt) { stats.deferred++; continue; }
    attempted++;
    const old = row.independent_coords;
    const guard = old == null ? "independent_coords=is.null" : `independent_coords=eq.${enc(JSON.stringify(old))}`;
    try {
      const r = await fetchImpl(`${sb.url}/rest/v1/wf_inventory?place_id=eq.${enc(row.place_id)}&${guard}&select=place_id`, {
        method: "PATCH", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { ...H, "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ independent_coords: p.next }),
      });
      if (!r.ok) { stats.writeFailed++; continue; }
      const back = await r.json();
      if (!Array.isArray(back) || back.length !== 1) { stats.conflicts++; continue; }
      if (p.action === "remove") stats.expiredRemoved++;
      else if (p.kind === "renew") stats.renewed++;
      else stats.added++;
    } catch { stats.writeFailed++; }
  }
  stats.attempted = attempted;
  stats.succeeded = stats.renewed + stats.added + stats.expiredRemoved;
  return stats;
}

const top = (o, n = 4) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ") || "none";

// The wf_job_pulse note: what was renewed, removed and skipped, and why.
export function renewalNote(s) {
  return `renewed ${s.renewed}, added ${s.added}, expired-removed ${s.expiredRemoved}`
    + (s.conflicts ? `, conflicts ${s.conflicts}` : "") + (s.writeFailed ? `, write-failed ${s.writeFailed}` : "")
    + (s.deferred ? `, deferred ${s.deferred} (batch cap)` : "")
    + `; skipped: ${top(s.skipped)}; sightings ${s.sightingsUsable}/${s.sightingsFresh} usable (${top(s.sightingRejected, 3)})`;
}

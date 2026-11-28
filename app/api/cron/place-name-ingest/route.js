// app/api/cron/place-name-ingest/route.js — turns a place the OWNER names
// (public.wf_place_name_requests) into a Wayfind card, server-side.
//
// Owner, 2026-11-28: "if a place card does not exist we need to create it."
// The rules live in lib/placeNameIngest.js (pure, tested by
// scripts/test-place-name-ingest.mjs). This route only does the I/O:
//
//   1. LOOKUP. One Text Search (Pro mask, the same TEXT_PRO_MASK fields the
//      search route uses) per request, on a text_pro ledger grant. The answer
//      must name the place and sit in the request's town, or nothing happens.
//   2. RATING. lib/placeDetails.js getPlaceDetailsDated(): the shared,
//      cached Place Details read, on its own details_enterprise grant.
//   3. CARD. Only at Wayfind Score 9.0+ with a Google photo, through the SAME
//      builder and validator promote-index uses (buildInventoryRow ->
//      toWriteRow -> validateInventoryRow, plus the split-venue twin check),
//      so a card made here is byte-identical to a promoted one.
//
// OWNER-ONLY. There is no visitor path in: the request table is service-role
// only (RLS on, no policies) and this route answers only Vercel's cron secret.
//
// SPEND. Free lines only, through the ledger every other caller uses. A
// refused grant parks the request (waiting_lookup / waiting_rating) with its
// attempt refunded; the next run tries again. Nothing here raises a cap.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

import { gateShut, spendAllow, runWithTraffic, TRAFFIC } from "../../../../lib/spendGate";
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { getPlaceDetailsDated } from "../../../../lib/placeDetails";
import { wayfindScore } from "../../../../lib/wayfindScore";
import { buildInventoryRow } from "../../../../lib/seedPlaces";
import { toWriteRow, validateInventoryRow, metrosFromRows, bucketMetro, partitionSplitVenues, PROMOTE_METROS } from "../../../../lib/promoteIndex";
import { pickCandidate, cardDecision, toPlacesObject, INGEST_BATCH, INGEST_MAX_ATTEMPTS } from "../../../../lib/placeNameIngest";

const JOB = "place-name-ingest";
const TEXT_PRO_MASK = [
  "places.id", "places.displayName", "places.location", "places.types",
  "places.formattedAddress", "places.photos", "places.primaryType",
].join(",");
const DEADLINE_MS = 45000;

function headers(s, extra = {}) {
  return { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", ...extra };
}

async function patchRequest(s, id, fields) {
  const r = await fetch(`${s.url}/rest/v1/wf_place_name_requests?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", cache: "no-store", headers: headers(s, { Prefer: "return=minimal" }),
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`request update -> ${r.status}`);
}

async function getJson(s, path) {
  const r = await fetch(`${s.url}/rest/v1/${path}`, { cache: "no-store", headers: headers(s) });
  if (!r.ok) throw new Error(`${path.split("?")[0]} -> ${r.status}`);
  return r.json();
}

async function liveMetros(s) {
  try {
    const m = metrosFromRows(await getJson(s, "wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true"));
    return Object.keys(m).length ? m : PROMOTE_METROS;
  } catch { return PROMOTE_METROS; }
}

async function textSearch(gkey, req) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": TEXT_PRO_MASK },
    body: JSON.stringify({
      textQuery: `${req.name}, ${req.area}, FL`, maxResultCount: 5,
      locationBias: { circle: { center: { latitude: req.near_lat, longitude: req.near_lng }, radius: 30000 } },
    }),
  });
  if (!r.ok) throw new Error(`google text search -> ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.places) ? d.places : [];
}

// One request, start to finish (or to a parked state). Returns the outcome status.
async function processOne(s, gkey, metros, req) {
  const attempts = (req.attempts || 0) + 1;
  let r = { ...req };

  if (!r.place_id) {
    if (!(await spendAllow("text_pro"))) {
      await patchRequest(s, r.id, { status: "waiting_lookup", last_error: "Google lookup allowance refused this run; retries automatically" });
      return "waiting_lookup";
    }
    const pick = pickCandidate(await textSearch(gkey, r), r);
    if (!pick.place) {
      await patchRequest(s, r.id, { status: pick.status, last_error: pick.reason, attempts, processed_at: new Date().toISOString() });
      return pick.status;
    }
    const p = pick.place;
    r = { ...r, place_id: p.id, matched_name: p.displayName && p.displayName.text, address: p.formattedAddress || null,
      primary_type: p.primaryType || null, google_types: Array.isArray(p.types) ? p.types : [] };
    await patchRequest(s, r.id, { place_id: r.place_id, matched_name: r.matched_name, address: r.address,
      primary_type: r.primary_type, google_types: r.google_types, status: "waiting_rating", last_error: null });
  }

  const existing = await getJson(s, `wf_inventory?select=place_id&place_id=eq.${encodeURIComponent(r.place_id)}`);
  if (existing.length) {
    await patchRequest(s, r.id, { status: "already_card", last_error: null, attempts, processed_at: new Date().toISOString() });
    return "already_card";
  }

  const dated = await getPlaceDetailsDated(r.place_id);
  const d = dated && dated.details;
  if (!d) {
    await patchRequest(s, r.id, { status: "waiting_rating", last_error: "Google rating allowance refused this run; retries automatically" });
    return "waiting_rating";
  }
  const score = wayfindScore(d.rating, d.reviews);
  const base = { rating: d.rating, reviews: d.reviews, score, attempts, processed_at: new Date().toISOString() };
  const decision = cardDecision({ score, businessStatus: d.businessStatus, photoRef: d.photoRef });
  if (!decision.publish) {
    await patchRequest(s, r.id, { ...base, status: decision.status, last_error: decision.reason });
    return decision.status;
  }

  const metro = bucketMetro(d.lat, d.lng, metros);
  if (!metro) {
    await patchRequest(s, r.id, { ...base, status: "outside_metros", last_error: "outside every metro Wayfind serves" });
    return "outside_metros";
  }
  const nowIso = new Date().toISOString();
  const built = buildInventoryRow(toPlacesObject(r, d), metro, { nowIso });
  if (!built.row) {
    await patchRequest(s, r.id, { ...base, metro, status: "unclassified", last_error: built.reason });
    return "unclassified";
  }
  const w = toWriteRow(built.row, nowIso);
  const v = validateInventoryRow(w, { metroKey: metro, metros });
  if (!v.ok) {
    await patchRequest(s, r.id, { ...base, metro, status: "unclassified", last_error: v.errors.join("; ").slice(0, 300) });
    return "unclassified";
  }
  const part = await partitionSplitVenues([w], (path) => getJson(s, path));
  if (part.twins.length) {
    const t = part.twins[0].twin;
    await patchRequest(s, r.id, { ...base, metro, status: "already_card", last_error: `same venue already served as ${t.place_id}` });
    return "already_card";
  }
  const up = await fetch(`${s.url}/rest/v1/wf_inventory`, {
    method: "POST", cache: "no-store",
    headers: headers(s, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([w]),
  });
  if (!up.ok) throw new Error(`card write -> ${up.status}: ${(await up.text()).slice(0, 200)}`);
  await patchRequest(s, r.id, { ...base, metro, status: "published", last_error: null });
  return "published";
}

async function run(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== "Bearer " + secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (gateShut()) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "intentional skip: gate shut" });
    return Response.json({ ok: true, skipped: "gate shut" });
  }
  const s = sbEnv();
  const gkey = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  if (!s || !gkey) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 1, note: "cannot run: " + (!s ? "no supabase service env" : "missing GOOGLE_MAPS_SERVER_KEY") });
    return Response.json({ ok: false, error: "unconfigured" }, { status: 503 });
  }

  let open;
  try {
    open = await getJson(s, `wf_place_name_requests?select=*&status=in.(pending,waiting_lookup,waiting_rating)&attempts=lt.${INGEST_MAX_ATTEMPTS}&order=updated_at.asc&limit=${INGEST_BATCH}`);
  } catch (e) {
    await recordPulse(JOB, { attempted: 1, succeeded: 0, failed: 1, note: "request read failed: " + String(e.message || e).slice(0, 120) });
    return Response.json({ ok: false, error: "request read failed" }, { status: 503 });
  }
  if (!open.length) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "healthy empty: no open requests" });
    return Response.json({ ok: true, open: 0 });
  }

  const started = Date.now();
  const metros = await liveMetros(s);
  const outcomes = {};
  let failed = 0;
  for (const item of open) {
    if (Date.now() - started > DEADLINE_MS) break;
    try {
      const st = await processOne(s, gkey, metros, item);
      outcomes[st] = (outcomes[st] || 0) + 1;
    } catch (e) {
      failed += 1;
      const msg = String(e.message || e).slice(0, 300);
      const attempts = (item.attempts || 0) + 1;
      try { await patchRequest(s, item.id, { attempts, last_error: msg, ...(attempts >= INGEST_MAX_ATTEMPTS ? { status: "failed" } : {}) }); } catch {}
    }
  }
  const parked = (outcomes.waiting_lookup || 0) + (outcomes.waiting_rating || 0);
  const note = Object.entries(outcomes).map(([k, n]) => `${k}:${n}`).join(" ") + (failed ? ` errors:${failed}` : "");
  await recordPulse(JOB, {
    attempted: open.length - parked, succeeded: Object.values(outcomes).reduce((a, b) => a + b, 0) - parked, failed,
    note: (parked && !failed && parked === open.length ? "budget limit reached: Google free allowance; parked " + parked + " " : "") + note,
  });
  return Response.json({ ok: failed === 0, outcomes, failed });
}

export async function GET(req) {
  return runWithTraffic(TRAFFIC.BACKGROUND, () => run(req));
}

#!/usr/bin/env node
/**
 * seed-fall-instagram-finds-sep06 — the fall Instagram-sourced batch of
 * 2026-09-06, applied. Same shape as scripts/seed-fall-sarasota-2026.mjs:
 * one PATCH section (a correction to a row already in wf_events) and one
 * ROWS section (new venues), both from primary sources read the same day.
 *
 * PATCH — SeaWorld Orlando's Spooktacular gained a Hotel Transylvania tie-in
 * for 2026 (Drac and Mavis, plus a separately ticketed Monster Breakfast).
 * SeaWorld's own event page still only carries the dates; the character
 * addition is second-party (ClickOrlando, Attractions Magazine). The patch
 * says so explicitly rather than blending the two sources into one claim.
 *
 * ROWS — one new venue: Halloween at Villatel Resort Orlando, a guest-only
 * haunted-villa walkthrough. Every fact on the row was read from the
 * resort's own seasonal-events page on 2026-09-06.
 *
 * The new row is pinned to ONE shelf in lib/fallDiscoveries2026.js
 * FALL_DISCOVERY_RAIL, same as every Sarasota-side row before it.
 * scripts/test-fall-intent-rails.mjs reads this file (alongside
 * seed-fall-sarasota-2026.mjs) to build the set of ids a pin is allowed to
 * name, so a pin without a matching row here or in that file fails the guard.
 *
 * Idempotent: PATCH by event_id, upsert on event_id.
 *   node scripts/seed-fall-instagram-finds-sep06.mjs --dry
 *   node scripts/seed-fall-instagram-finds-sep06.mjs
 */
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
function env() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL || E.SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
const GKEY = E.GOOGLE_MAPS_SERVER_KEY || E.GOOGLE_MAPS_API_KEY || E.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!SUPA || !KEY) { console.error("seed-fall-instagram-finds-sep06: missing Supabase env"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const VERIFIED = "2026-09-06T00:00:00Z";

// ── PATCHES ─────────────────────────────────────────────────────────────────
export const PATCHES = {
  // The Hotel Transylvania tie-in is reported second-party; the dates stay
  // first-party. Said out loud in verify_note rather than merged silently.
  "seaworld-spooktacular-2026": {
    editorial_summary: "A daytime trick-or-treat trail, costumed characters and a candy-themed party included with regular SeaWorld admission on 26 select dates, with Hotel Transylvania's Drac and Mavis joining for the first time in 2026.",
    insider_tip: "It runs in the DAY and Howl-O-Scream runs at night on many of the same dates. Check which you have bought; they are different events and different tickets. The Hotel Transylvania Monster Breakfast at SeaFire Inn is a separate paid booking on top of admission.",
    verify_note: "2026-09-06: seaworld.com/orlando/events/halloween-spooktacular re-read — 'Select Dates, Aug. 29 - Nov. 1', included with regular admission. The Hotel Transylvania addition (Drac and Mavis, plus a separately ticketed Monster Breakfast character dining at SeaFire Inn) is reported by ClickOrlando 2026-08-14 and reviewed by Attractions Magazine, and is NOT yet detailed on SeaWorld's own Spooktacular page — the dates remain first-party, the Hotel Transylvania detail is second-party.",
  },
};

// ── NEW ROWS ────────────────────────────────────────────────────────────────
const BASE = { year: 2026, timezone: "America/New_York", event_status: "scheduled", state: "FL", last_verified_at: VERIFIED, source_type: "official-organizer", source_tier: 1, verification_confidence: "high" };

export const ROWS = [
// ── RESORT HALLOWEEN (guest-only, verified against the resort's own page) ──
//
// HELD AT `paused`, 2026-09-06, FOR IMAGE PROOF — NOT for a date or source
// doubt. Every fact below was read off the resort's own page the same day.
//
// The reason is upstream: Google Places (New) is returning errors in
// production (billing disabled on the Cloud project), so /api/photo cannot
// resolve a first photo for any place that is not ALREADY in the 30-day
// photo cache. Villatel is not, and its stored wf_inventory.photo_ref has
// expired, so both the ?place= and the ?ref= form 404 right now — verified
// against production. Every OTHER scheduled event hero still 302s off the
// pre-outage cache.
//
// A `scheduled` row here would therefore be the one card on the hub with a
// broken image. Shipping that to prove a row exists is the imageless card
// scripts/check-no-imageless-card.mjs exists to prevent, so the row waits
// instead. TO RELEASE: restore Google Cloud billing, confirm
// `curl -sI "https://www.gowayfind.com/api/photo?place=ChIJsQagnL9_54gRBssKAR3j6S8&w=800"`
// returns 302, then change event_status below to "scheduled" and re-run this
// script. The status lives in the file, not only in Supabase, so the hold is
// reviewable and its release is a diff.
{ ...BASE, event_status: "paused", event_id: "villatel-halloween-2026", event_series_id: "villatel-halloween", event_name: "Halloween at Villatel Resort Orlando", short_title: "Villatel Halloween", slug: "villatel-resort-orlando-halloween-2026",
  start_date: "2026-09-10", end_date: "2026-11-01", start_time: "19:00:00", end_time: "22:00:00", select_nights: true,
  schedule_note: "September 10 through November 1, 2026. The Haunted Villa walkthrough runs Thursday to Sunday, 7 to 10pm. Resort guests only.",
  venue: "Villatel Resort Orlando", address: null, city: "Orlando", county: "Orange", _q: "Villatel Resort Orlando, Orlando, FL", place_id: "ChIJsQagnL9_54gRBssKAR3j6S8", lat: 28.4629103, lng: -81.447068,
  category: "halloween", subcategory: "resort", tags: ["fall", "halloween", "pumpkins", "family", "resort"], audience: ["families", "kids"],
  is_free: false, price_band: "$$$", price_min: null, official_event_url: "https://www.villatelresort.com/experiences/seasonal-events/halloween/", official_ticket_url: null,
  card_hook: "A guest only haunted villa and a floating pumpkin patch.",
  editorial_summary: "Villatel turns its villas over to Halloween from September 10: a walkthrough Haunted Villa, a pumpkin patch floating in the main pool, and a trick or treat trail across the grounds.",
  why_go: "Halloween you can walk to in slippers, included with the stay rather than a second ticket at a park gate.",
  skip_if: "You are not staying at the resort. The Haunted Villa is open to guests only, so there is no way to visit for just the night.",
  insider_tip: "The Haunted Villa runs Thursday to Sunday only. A Monday to Wednesday stay misses it entirely.",
  duration_recommendation: "Evening", crowd_level: "moderate", wayfind_verdict: "The easiest Halloween in Orlando, if you were booking a villa anyway.",
  source_url: "https://www.villatelresort.com/experiences/seasonal-events/halloween/",
  verify_note: "2026-09-06: the resort's own Halloween page — 'September 10 through November 1, 2026'; the Haunted Villa is 'open exclusively for resort guests', Thursdays to Sundays 7 to 10pm; also lists a floating pumpkin patch in the main pool and a trick or treat trail.",
  editorial_score: 7.5, uniqueness_score: 8, popularity_score: 6 },
];

async function resolve(q) {
  if (!GKEY) return null;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": "places.id,places.location,places.formattedAddress,places.displayName" },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  });
  const j = await r.json();
  if (j && j.error) { console.error(`seed-fall-instagram-finds-sep06: Google refused — ${j.error.status || j.error.code}: ${j.error.message}. Key problem, not a missing venue. Nothing written.`); process.exit(1); }
  const p = j && j.places && j.places[0];
  if (!p || !p.location) return null;
  return { place_id: p.id, lat: p.location.latitude, lng: p.location.longitude, formatted: p.formattedAddress, name: p.displayName?.text };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = [];
  for (const row of ROWS) {
    const { _q, ...rest } = row;
    const r = { ...rest };
    if (r.place_id) { r.hero_image = `/api/photo?place=${r.place_id}&w=800`; }
    else if (r.lat == null) {
      const hit = await resolve(_q);
      if (hit) { r.place_id = hit.place_id; r.lat = hit.lat; r.lng = hit.lng; r.hero_image = `/api/photo?place=${hit.place_id}&w=800`; }
      else { r.place_id = null; r.lat = null; r.lng = null; }
    }
    out.push(r);
    console.log(`${r.place_id ? "pinned    " : r.lat != null ? "coords    " : "UNRESOLVED"} ${r.event_name}  ${r.lat?.toFixed?.(4)},${r.lng?.toFixed?.(4)}`);
  }
  const KEYS = [...new Set(out.flatMap(Object.keys))];
  const norm = out.map((r) => Object.fromEntries(KEYS.map((k) => [k, k in r ? r[k] : null])));
  if (DRY) { console.log(`\nseed-fall-instagram-finds-sep06: DRY OK — ${norm.length} rows over ${KEYS.length} columns and ${Object.keys(PATCHES).length} patches prepared, nothing written`); process.exit(0); }

  let patched = 0;
  for (const [event_id, body] of Object.entries(PATCHES)) {
    const r = await fetch(`${SUPA}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(event_id)}`, {
      method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...body, last_verified_at: VERIFIED }),
    });
    const text = await r.text();
    if (!r.ok) { console.error(`PATCH ${event_id}: FAIL ${r.status} — ${text}`); process.exit(1); }
    const n = (() => { try { return JSON.parse(text).length; } catch { return 0; } })();
    if (n !== 1) { console.error(`PATCH ${event_id}: matched ${n} rows, expected 1`); process.exit(1); }
    patched++;
  }
  const res = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=event_id`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(norm),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`seed-fall-instagram-finds-sep06: FAIL ${res.status} — ${text}`); process.exit(1); }
  let n = out.length; try { const j = JSON.parse(text); if (Array.isArray(j)) n = j.length; } catch {}
  console.log(`seed-fall-instagram-finds-sep06: OK — ${patched} rows patched, ${n} rows upserted`);
}

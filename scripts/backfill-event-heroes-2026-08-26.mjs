#!/usr/bin/env node
/**
 * backfill-event-heroes — give every wf_events row a hero_image.
 * Owner, 2026-08-26 (on imageless AUGTOBER tiles): "make sure these also have images."
 *
 * For each event with no hero_image: resolve its VENUE via Places searchText
 * (venue + city + state, locationBias at the event's coords), gated on token
 * match AND distance — a low-confidence match writes NOTHING (reported, never
 * guessed). The venue's first photo ref becomes hero_image as a ref-mode
 * /api/photo URL (CDN-cached 30 days; quota raised earlier today).
 * place_id is deliberately NOT written — hero art only, no entity claims.
 * DRY by default; --commit writes. Run from the repo root (reads ./.env.local).
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const KEY = String(process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
if (!URL_ || !SVC || !KEY) { console.error("missing env"); process.exit(2); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const COMMIT = process.argv.includes("--commit");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const overlap = (a, b) => { const B = new Set(norm(b)); const A = norm(a); return A.length ? A.filter((w) => B.has(w)).length / A.length : 0; };
const miles = (a, b) => { const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), dy = a.lat - b.lat; return Math.sqrt(dx * dx + dy * dy) * 69; };

const events = await fetch(`${URL_}/rest/v1/wf_events?or=(hero_image.is.null,hero_image.eq.)&select=event_id,event_name,venue,city,state,lat,lng`, { headers: H }).then((r) => r.json());
console.log(`${events.length} events without hero_image${COMMIT ? "" : "  (DRY RUN)"}`);
let done = 0, skipped = 0;
for (const e of events) {
  const target = e.venue && !/citywide/i.test(e.venue) ? e.venue : e.event_name;
  const q = `${target}, ${e.city || ""}, ${e.state || "FL"}`;
  try {
    const body = { textQuery: q, pageSize: 3 };
    if (Number.isFinite(e.lat) && Number.isFinite(e.lng)) body.locationBias = { circle: { center: { latitude: e.lat, longitude: e.lng }, radius: 30000 } };
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { skipped++; console.log(`  ✗ ${e.event_id}: searchText ${r.status}`); continue; }
    const places = (await r.json()).places || [];
    const cand = places.find((p) => {
      const nameOk = overlap(target, p.displayName && p.displayName.text) >= 0.5;
      const distOk = !Number.isFinite(e.lat) || !p.location || miles({ lat: e.lat, lng: e.lng }, { lat: p.location.latitude, lng: p.location.longitude }) < 8;
      return nameOk && distOk && Array.isArray(p.photos) && p.photos[0] && p.photos[0].name;
    });
    if (!cand) { skipped++; console.log(`  ◻ ${e.event_id}: no confident venue match for "${target}" — nothing written`); continue; }
    const hero = "/api/photo?ref=" + encodeURIComponent(cand.photos[0].name) + "&w=800";
    if (COMMIT) {
      const w = await fetch(`${URL_}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(e.event_id)}`, {
        method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ hero_image: hero }),
      });
      if (!w.ok) { skipped++; console.log(`  ✗ ${e.event_id}: write ${w.status}`); continue; }
    }
    done++;
    console.log(`  ✓ ${e.event_id} <- ${cand.displayName.text}`);
  } catch (err) { skipped++; console.log(`  ✗ ${e.event_id}: ${String(err).slice(0, 80)}`); }
}
console.log(`\nbackfill-event-heroes: ${COMMIT ? "COMMITTED" : "DRY"} — ${done} heroes ${COMMIT ? "written" : "resolvable"}, ${skipped} skipped (no guessing)`);

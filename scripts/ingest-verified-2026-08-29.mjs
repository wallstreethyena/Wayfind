#!/usr/bin/env node
/**
 * ingest-verified-2026-08-29 — owner Florida pin batch (Gabe, 2026-08-29).
 *
 * Inventory + sourced two-beat editorial only. Resolve through Google Places
 * searchText against pinned EXPECT ids. Dedupe by place_id. Fill a silent
 * hook only when editorial is empty. Never overwrite a better sourced hook.
 * S.O.B. Burgers is already_in — no second row, no invented two-beat.
 * HOLDs (nothing written): Monarch Kitchen & Bar, Urban Brews & Creamery,
 * Skinny Burger Food Truck, The Founders Club.
 *
 *   node scripts/ingest-verified-2026-08-29.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-08-29.mjs --commit   # write wf_inventory + wf_events
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPlaceFields } from "../lib/seedPlaces.js";
import { classifyPlace } from "../lib/placeTaxonomy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");
const BATCH = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29.json"), "utf8"));

export const OWNER_BATCH = BATCH;
// Literal pins — a drifted batch JSON cannot silently retarget ingest.
// test-owner-places-2026-08-29 greps these ChIJ strings in THIS file.
export const PINNED_IDS = {
  farmersMilk: "ChIJYQCTNOCxwogR77eUWAEbqwQ",
  peacheyLandings: "ChIJGZxJfQBBw4gRv9t1RoPs7Vk",
  peacheyCattlemen: "ChIJF_JCwylHw4gRgRW83f7ggDg",
  diveDen: "ChIJkeMXXa9Bw4gRCn7uZ5kG-eQ",
  frogPondSpb: "ChIJcX8K3HADw4gRCgXXlZf5ccY",
  frogPondDowntown: "ChIJKyxHD4fhwogR1O-zkiFq51o",
  burgerCulture: "ChIJm_MbVcLHwogRdDvs5papv1A",
  campfired: "ChIJd6m6J4jPwogR7P5HCLMRyyg",
};
export const EXPECT = Object.fromEntries(
  BATCH.places.filter((p) => p.placeId).map((p) => [p.key, p.placeId]),
);
export const ALREADY_IN = BATCH.places.filter((p) => p.status === "already_in");
export const HOLDS = BATCH.holds;
for (const p of BATCH.places.filter((x) => x.status === "add")) {
  if (PINNED_IDS[p.key] !== p.placeId) {
    console.error(`PINNED_IDS drift: ${p.key} file=${PINNED_IDS[p.key]} batch=${p.placeId}`);
    process.exit(1);
  }
}

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const GKEY = process.env.GOOGLE_MAPS_SERVER_KEY;
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const miss = [!GKEY && "GOOGLE_MAPS_SERVER_KEY", !URL_ && "SUPABASE_URL", !SVC && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
if (miss.length) { console.error("missing env: " + miss.join(", ")); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const nowIso = new Date().toISOString();

const NEW_PLACES = BATCH.places.filter((p) => p.status === "add").map((p) => ({
  key: p.key,
  q: p.q,
  name: p.name,
  metro: p.metro,
  wantCategory: p.wantCategory,
  center: p.center,
  editorial: p.knownFor,
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.types", "places.primaryType", "places.location", "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus", "places.photos"].join(",");

async function searchText(q, center) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: 3, ...(center ? { locationBias: { circle: { center, radius: 40000 } } } : {}) }),
    });
    if (r.ok) return (await r.json()).places || [];
    const body = await r.text();
    if (![429, 500, 502, 503].includes(r.status)) throw new Error(`searchText ${r.status}: ${body.slice(0, 200)}`);
    await sleep(600 * (attempt + 1));
  }
  throw new Error("searchText: exhausted retries");
}

const STOP = new Set(["the", "of", "and", "&", "at", "a", "an", "on", "in"]);
function nameMatch(want, got) {
  const tok = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
  const w = tok(want), g = new Set(tok(got));
  if (!w.length) return 0;
  return w.filter((t) => g.has(t)).length / w.length;
}

const report = { created: [], patched: [], flagged: [], holds: HOLDS.slice(), already_in: ALREADY_IN.map((p) => ({ name: p.name, place_id: p.placeId })), events: [] };

console.log(`\ningest-verified-2026-08-29 ${COMMIT ? "(COMMIT)" : "(DRY RUN)"}\n`);
console.log("── already-in (nothing written) ──");
for (const p of ALREADY_IN) console.log(`  ↻ ${p.name.padEnd(42)} ${p.placeId}  ${p.note}`);

const staged = [];
for (const c of NEW_PLACES) {
  const hits = await searchText(c.q, c.center);
  const best = hits[0] || null;
  const f = best ? extractPlaceFields(best) : null;
  const match = f ? nameMatch(c.name, f.name) : 0;
  const operational = f && (!f.status || f.status === "OPERATIONAL");
  const addr = (best && best.formattedAddress) || "";
  const expected = EXPECT[c.key];
  if (!f || match < 0.5 || !operational || f.place_id !== expected) {
    const why = !f ? "no result"
      : f.place_id !== expected ? `place_id drift — expected ${expected}, got ${f.place_id} (${f.name})`
      : match < 0.5 ? "name mismatch → " + f.name
      : "status " + f.status;
    report.flagged.push({ want: c.name, got: f && f.name, match, status: f && f.status, addr, why });
    console.log(`  ⚠ ${c.name}: FLAGGED (${why}) — not staged`);
    continue;
  }
  const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(f.place_id)}&select=place_id,name,editorial,source`, { headers: H }).then((r) => r.json());
  const existing = Array.isArray(dup) && dup[0] ? dup[0] : null;
  const { category, tags } = classifyPlace(f.google_types, f.primary_type, f.name) || {};
  if (category && category !== c.wantCategory) {
    console.log(`  ⚑ ${c.name}: classifier "${category}" vs approved "${c.wantCategory}" — using approved, flagged`);
    report.flagged.push({ want: c.name, why: `classifier says ${category}, spec says ${c.wantCategory} (spec used; row locked)`, soft: true });
  }
  const priorEd = existing && existing.editorial;
  const hasBetter = !!(priorEd && String(priorEd).trim().length >= 20);
  const editorial = hasBetter ? priorEd : c.editorial;
  const row = {
    place_id: f.place_id, name: f.name, lat: f.lat, lng: f.lng,
    category: c.wantCategory, tags: tags || [], google_types: f.google_types,
    primary_type: f.primary_type, metro: c.metro,
    signals: { rating: f.rating, reviews: f.reviews, price: f.price, priceNum: f.priceNum },
    editorial, photo_ref: f.photo_ref ?? null,
    status: f.status ?? "OPERATIONAL", anchor: false, source: "owner-verified",
    needs_review: false, last_verified_at: nowIso, locked: true,
  };
  staged.push({ c, row, addr, match, already: !!existing, skippedHook: hasBetter });
  console.log(`  ${existing ? "↻" : "＋"} ${c.name.padEnd(42)} → "${f.name}"  ${addr}${hasBetter ? "  (kept existing editorial)" : ""}`);
}

console.log("\n── holds (nothing written) ──");
for (const h of HOLDS) console.log(`  ✗ ${h.name.padEnd(46)} ${h.status}`);

const hard = report.flagged.filter((f) => !f.soft);
if (hard.length) {
  console.error("\nHARD FLAGS present — fix them before --commit can write place rows:");
  for (const f of hard) console.error(`  • ${f.want}: ${f.why}`);
  process.exit(1);
}
if (!COMMIT) {
  console.log(`\nDRY RUN — would write ${staged.length} place rows and ${BATCH.events.length} events. Re-run with --commit.`);
  process.exit(0);
}

if (staged.length) {
  const res = await fetch(`${URL_}/rest/v1/wf_inventory?on_conflict=place_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(staged.map((s) => s.row)),
  });
  if (!res.ok) { console.error(`place upsert failed ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
  report.created = staged.map((s) => ({ name: s.row.name, place_id: s.row.place_id, metro: s.row.metro, category: s.row.category, upgraded: s.already, skippedHook: s.skippedHook }));
  console.log(`  ✓ upserted ${staged.length} place rows`);
}

{
  const seen = new Date().toISOString();
  const ids = staged.map((s) => s.row.place_id);
  if (ids.length) {
    const invRows = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=in.(${ids.map((i) => `"${i}"`).join(",")})&select=place_id,name,lat,lng,category,signals`, { headers: H }).then((r) => r.json());
    if (!Array.isArray(invRows) || invRows.length !== ids.length) {
      console.error(`index upsert aborted: expected ${ids.length} inventory rows to mirror, got ${Array.isArray(invRows) ? invRows.length : "error"}`);
      process.exit(1);
    }
    const idx = await fetch(`${URL_}/rest/v1/wf_place_ids`, {
      method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(invRows.map((r) => ({ place_id: r.place_id, name: r.name, lat: r.lat, lng: r.lng, category: r.category, signals: r.signals, seen_at: seen }))),
    });
    if (!idx.ok) { console.error(`wf_place_ids upsert failed ${idx.status}: ${(await idx.text()).slice(0, 300)}`); process.exit(1); }
    console.log(`  ✓ wf_place_ids index: ${invRows.length} ids mirrored`);
  }
}

{
  const now = new Date().toISOString();
  const rows = BATCH.events.map((e) => {
    const { ...rest } = e;
    return { ...rest, last_verified_at: now };
  });
  const ev = await fetch(`${URL_}/rest/v1/wf_events?on_conflict=event_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!ev.ok) { console.error(`events upsert failed ${ev.status}: ${(await ev.text()).slice(0, 300)}`); process.exit(1); }
  report.events = rows.map((r) => r.event_id);
  console.log(`  ✓ wf_events: ${rows.length} rows (Night Market dates + Harvest Festival)`);
}

console.log("\n── created ──");
for (const c of report.created) console.log(`  ${c.upgraded ? "↻" : "✓"} ${c.name.padEnd(46)} ${c.place_id}  ${c.metro}/${c.category}`);
console.log(`\ndone: ${report.created.length} written, ${ALREADY_IN.length} already-in, ${HOLDS.length} held, ${report.events.length} events.\n`);

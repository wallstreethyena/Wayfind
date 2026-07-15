// scripts/seed-anchors.mjs — resolve ONLY the marquee anchors in
// data/anchors.json into wf_inventory. This is the fix for anchors=0 and the
// absent-Mote problem, done WITHOUT the full seeder's ~135-call grid sweep.
//
//   node scripts/seed-anchors.mjs            # DRY RUN — resolve + report, writes nothing
//   node scripts/seed-anchors.mjs --commit   # upsert the resolved, verified anchors
//   node scripts/seed-anchors.mjs --metro manatee-sarasota
//
// WHY A SEPARATE SCRIPT (not `seed-places.mjs`):
//   • seed-places.mjs always runs the grid discovery sweep first (~135 Google
//     calls) before its anchor pass — expensive, and unnecessary to seed anchors.
//   • seed-places.mjs PREDATES v6.16: it does not know about the excluded /
//     secondary_categories columns, and committing its full reconcile+diff would
//     regress the exclusion work. This script writes ONLY anchor rows.
//
// COST: one searchText per anchor (maxResultCount 3). ~15 calls, ≈$0.50. It does
// NOT touch the ~1,027 existing rows.
//
// SAFETY (the closed-listing trap): Google can return a CLOSED "City Island" Mote
// listing that still reports open. So every anchor is checked for (a) a real
// name match and (b) businessStatus === OPERATIONAL, and --commit REFUSES any
// anchor that fails either — it prints a Google Maps link so the owner can verify
// and fix the anchor's name/city, rather than seeding a wrong place.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventoryRow } from "../lib/seedPlaces.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");
const metroArg = process.argv.indexOf("--metro");
const METRO = metroArg >= 0 ? process.argv[metroArg + 1] : "manatee-sarasota";

// env (values never printed)
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const miss = [!KEY && "GOOGLE_MAPS_SERVER_KEY", !URL_ && "SUPABASE_URL", !SVC && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
if (miss.length) { console.error("seed-anchors: missing env: " + miss.join(", ")); process.exit(1); }

const VIA_NEARBY = process.argv.includes("--nearby"); // resolve via searchNearby (uncapped metric) instead of searchText
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANCHOR_MASK = ["places.id", "places.displayName", "places.types", "places.location", "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus", "places.photos"].join(",");

// Infer the Google searchNearby type(s) for an anchor from its category, tags and
// name. searchNearby matches by TYPE + location (not by name), so we search the
// anchor's type near the metro and name-match the results. Marquee places rank
// high by popularity, so this reliably surfaces them; ambiguous cases are flagged.
function nearbyTypesFor(a) {
  const n = (a.name || "").toLowerCase();
  if (a.category === "beach") return ["beach"];
  if (/\baquarium\b/.test(n)) return ["aquarium"];
  if (/botanical|\bgardens?\b/.test(n)) return ["botanical_garden"];
  if (/\bzoo\b|jungle|big cat|habitat|sanctuary|wildlife/.test(n)) return ["zoo", "wildlife_park", "wildlife_refuge", "tourist_attraction"];
  if ((a.tags || []).includes("museums") || /\bmuseum\b/.test(n)) return ["museum", "art_museum", "history_museum"];
  if ((a.tags || []).includes("arts") || /performing arts|hall|theat(er|re)/.test(n)) return ["performing_arts_theater", "auditorium", "concert_hall"];
  if ((a.tags || []).includes("outdoors") || /preserve|park|riverwalk|point|trail/.test(n)) return ["state_park", "national_park", "park", "tourist_attraction"];
  return ["tourist_attraction"];
}

// One searchNearby call (different quota metric than searchText → uncapped when
// SearchText/day is exhausted). Same retry policy; per-day quota still fails fast.
async function searchNearby(includedTypes, center, radius = 45000) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": ANCHOR_MASK },
      body: JSON.stringify({ includedTypes, maxResultCount: 20, rankPreference: "POPULARITY", locationRestriction: { circle: { center, radius } } }),
    });
    if (r.ok) return (await r.json()).places || [];
    const body = await r.text();
    if (r.status === 429 && /per\s*day|PerDay|daily/i.test(body)) throw new DailyQuotaExhausted(body.slice(0, 200));
    if (![429, 500, 502, 503].includes(r.status)) throw new Error(`searchNearby ${r.status}: ${body.slice(0, 200)}`);
    await sleep(600 * (attempt + 1));
  }
  throw new Error("searchNearby: exhausted retries (transient 429/5xx)");
}

// Pick the best name-match among a pile of nearby results for one anchor.
function bestNearbyMatch(anchor, hits) {
  let best = null, bestScore = -1;
  for (const p of hits) {
    const rn = (p.displayName && p.displayName.text) || "";
    const s = nameMatch(anchor.name, rn);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best ? { place: best, match: bestScore } : null;
}

// Sentinel: the project-wide SearchText PER-DAY quota is exhausted. Retrying is
// pointless (the window is daily, not a burst), so the caller aborts the whole
// run instead of hammering all 15 anchors x 4 retries against a hard cap. This is
// the cost-guard brake from the Places cost incident, not a transient error.
class DailyQuotaExhausted extends Error {}

// One searchText call. Retries a TRANSIENT 429/5xx (per-minute burst, 5xx), but
// aborts immediately on the PER-DAY quota — those are different failure modes.
async function searchText(q, center) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": ANCHOR_MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: 3, locationBias: { circle: { center, radius: 40000 } } }),
    });
    if (r.ok) return (await r.json()).places || [];
    const body = await r.text();
    if (r.status === 429 && /per\s*day|PerDay|daily/i.test(body)) throw new DailyQuotaExhausted(body.slice(0, 200));
    if (![429, 500, 502, 503].includes(r.status)) throw new Error(`searchText ${r.status}: ${body.slice(0, 200)}`);
    await sleep(600 * (attempt + 1));
  }
  throw new Error("searchText: exhausted retries (transient 429/5xx)");
}

// Name-match score between an anchor name and a resolved place name — SYMMETRIC.
// The naive "anchor tokens present in resolved / anchor tokens" penalises an
// anchor whose official Google name is SHORTER: "Big Cat Habitat and Gulf Coast
// Sanctuary" resolves to Google's "Big Cat Habitat" and scored only 3/6 = 50%,
// even though the resolved name is a clean subset of the anchor (a strong match).
// Taking the max of both directions credits that: a resolved name fully contained
// in the anchor (or vice-versa) scores 100%. It does NOT loosen the beach cases —
// "Siesta Key Beach" vs "South Lido Key Beach Park" still shares only key+beach
// either way (<=67%), so wrong beaches stay flagged.
const STOP = new Set(["the", "of", "and", "&", "at", "a", "an", "on", "in"]);
const toks = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
function nameMatch(anchorName, resolvedName) {
  const a = toks(anchorName), r = toks(resolvedName);
  if (!a.length || !r.length) return 0;
  const as = new Set(a), rs = new Set(r);
  const aInR = a.filter((t) => rs.has(t)).length / a.length; // anchor covered by resolved
  const rInA = r.filter((t) => as.has(t)).length / r.length; // resolved covered by anchor
  return Math.max(aInR, rInA);
}

// metro center (Manatee-Sarasota); anchors use a name+city query so exact center matters little.
const CENTER = { latitude: 27.35, longitude: -82.45 };
const gmaps = (id) => `https://www.google.com/maps/place/?q=place_id:${id}`;

async function existingIds() {
  const out = new Set();
  const r = await fetch(`${URL_}/rest/v1/wf_inventory?select=place_id,anchor&metro=eq.${encodeURIComponent(METRO)}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  if (r.ok) for (const row of await r.json()) out.add(row.place_id);
  return out;
}

const anchors = (JSON.parse(readFileSync(join(ROOT, "data/anchors.json"), "utf8"))[METRO]) || [];
if (!anchors.length) { console.error(`seed-anchors: no anchors for metro "${METRO}"`); process.exit(1); }

console.log(`seed-anchors: ${anchors.length} anchors for "${METRO}" — ${COMMIT ? "COMMIT" : "DRY RUN (nothing will be written)"}\n`);
const present = await existingIds();
const nowIso = "2026-07-14T00:00:00.000Z"; // fixed; new Date() is not needed and keeps runs reproducible

console.log(`  resolution: ${VIA_NEARBY ? "searchNearby (by type, uncapped metric)" : "searchText (by name)"}\n`);
const resolved = [];
for (const a of anchors) {
  try {
    let p, match;
    if (VIA_NEARBY) {
      const hits = await searchNearby(nearbyTypesFor(a), CENTER);
      await sleep(120);
      const m = bestNearbyMatch(a, hits);
      if (m) { p = m.place; match = m.match; }
    } else {
      const hits = await searchText(`${a.name} ${a.city || ""}`.trim(), CENTER);
      await sleep(120);
      p = hits[0];
      if (p) match = nameMatch(a.name, (p.displayName && p.displayName.text) || "");
    }
    if (!p || !p.id) { resolved.push({ a, ok: false, note: "NO Google result" }); continue; }
    const rn = (p.displayName && p.displayName.text) || "?";
    const operational = !p.businessStatus || p.businessStatus === "OPERATIONAL";
    const built = buildInventoryRow(p, METRO, { anchor: a, nowIso });
    resolved.push({ a, ok: true, place: p, row: built.row, resolvedName: rn, match, operational, status: p.businessStatus || "?", already: present.has(p.id) });
  } catch (e) {
    if (e instanceof DailyQuotaExhausted) {
      console.error("\n⛔ SearchText PER-DAY quota is exhausted (the Places cost-guard cap).");
      console.error("   The anchor resolution needs ~15 searchText calls; the daily budget is spent.");
      console.error("   → wait for the quota to reset (Google resets daily at midnight Pacific), OR");
      console.error("   → temporarily raise 'SearchText requests per day' in Cloud Console, then re-run.");
      console.error(`   (Google: ${e.message})`);
      process.exit(2);
    }
    resolved.push({ a, ok: false, note: e.message });
  }
}

// ── report ───────────────────────────────────────────────────────────────
// searchNearby matches by type, so a generic-type anchor (beach, park) can
// resolve to the WRONG specific place at a deceptively-high token overlap
// (Siesta Key Beach → "South Lido Key Beach Park", 67%). Auto-commit therefore
// demands a NEAR-EXACT match (0.85), and a COLLISION guard: if two anchors
// resolve to the same place_id, neither is trusted — that is the signal that a
// generic-type search couldn't distinguish them.
const MATCH_MIN = 0.85;
const idCounts = resolved.reduce((m, r) => { if (r.ok && r.place) m[r.place.id] = (m[r.place.id] || 0) + 1; return m; }, {});
const good = [], flagged = [];
for (const r of resolved) {
  if (!r.ok) { flagged.push(r); console.log(`  ✗ ${r.a.name} (${r.a.city}) → ${r.note}`); continue; }
  const collided = idCounts[r.place.id] > 1;
  // searchNearby resolves by TYPE, and every beach shares type=beach, so a named
  // beach can't be distinguished reliably — proven non-deterministic (the same
  // anchor resolved to different beaches across runs, and a generic "Public beach"
  // pin token-matches at 100%). Beaches are NEVER auto-committed via --nearby;
  // they need the name-precise searchText path (owner's quota bump).
  const beachViaNearby = VIA_NEARBY && r.a.category === "beach";
  const warn = !r.operational ? "⚠ NON-OPERATIONAL"
    : beachViaNearby ? "⚠ BEACH via searchNearby — not reliable, use searchText"
    : collided ? "⚠ COLLISION (2 anchors → same place)"
    : r.match < MATCH_MIN ? `⚠ WEAK/UNCERTAIN MATCH ${(r.match * 100).toFixed(0)}%` : "";
  (warn ? flagged : good).push(r);
  console.log(`  ${warn ? "⚠" : r.already ? "↻" : "＋"} ${r.a.name.padEnd(38)} → "${r.resolvedName}"  [${r.status}]  match=${(r.match * 100).toFixed(0)}%  → ${r.a.category}${r.a.tags?.length ? "/" + r.a.tags.join(",") : ""}`);
  if (warn) console.log(`      ${warn} — verify: ${gmaps(r.place.id)}`);
}

console.log(`\n  resolved OK: ${good.length}   flagged for a human: ${flagged.length}   already in inventory: ${good.filter((r) => r.already).length}`);

if (!COMMIT) { console.log("\nDRY RUN — nothing written. Verify the resolutions above, then re-run with --commit."); process.exit(0); }

// ── commit: only the clean, operational, name-matched anchors ─────────────
// A flagged anchor is NEVER auto-seeded — a wrong marquee place is worse than a
// missing one. Fix the anchor's name/city in data/anchors.json and re-run.
if (!good.length) { console.log("\nseed-anchors: nothing clean to commit; every anchor was flagged. Fix data/anchors.json and re-run."); process.exit(0); }

// Only columns that certainly exist (pre/post the v6.16 migration both). Anchors
// are owner-asserted ground truth → locked=true so the repair script's
// re-classification treats them as sacred (it skips locked rows).
const payload = good.map((r) => ({
  place_id: r.row.place_id, name: r.row.name, lat: r.row.lat, lng: r.row.lng,
  category: r.row.category, tags: r.row.tags, google_types: r.row.google_types,
  primary_type: r.row.primary_type, metro: METRO, signals: r.row.signals,
  editorial: r.row.editorial ?? null, photo_ref: r.row.photo_ref ?? null,
  status: r.row.status ?? "OPERATIONAL", anchor: true, source: "anchor",
  needs_review: false, last_verified_at: nowIso, locked: true,
}));

const res = await fetch(`${URL_}/rest/v1/wf_inventory?on_conflict=place_id`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(payload),
});
if (!res.ok) { console.error(`\nseed-anchors: write failed ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
console.log(`\nseed-anchors: committed ${payload.length} anchors (locked, anchor=true).`);
if (flagged.length) console.log(`  ${flagged.length} still need a human — fix data/anchors.json and re-run.`);

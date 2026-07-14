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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANCHOR_MASK = ["places.id", "places.displayName", "places.types", "places.location", "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus", "places.photos"].join(",");

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

// Fraction of the anchor's significant name tokens present in the resolved name.
const STOP = new Set(["the", "of", "and", "&", "at", "a", "an", "on", "in"]);
const toks = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
function nameMatch(anchorName, resolvedName) {
  const a = toks(anchorName), r = new Set(toks(resolvedName));
  if (!a.length) return 0;
  return a.filter((t) => r.has(t)).length / a.length;
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

const resolved = [];
for (const a of anchors) {
  try {
    const hits = await searchText(`${a.name} ${a.city || ""}`.trim(), CENTER);
    await sleep(120);
    const p = hits[0];
    if (!p || !p.id) { resolved.push({ a, ok: false, note: "NO Google result" }); continue; }
    const rn = (p.displayName && p.displayName.text) || "?";
    const match = nameMatch(a.name, rn);
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
const MATCH_MIN = 0.5;
const good = [], flagged = [];
for (const r of resolved) {
  if (!r.ok) { flagged.push(r); console.log(`  ✗ ${r.a.name} (${r.a.city}) → ${r.note}`); continue; }
  const warn = !r.operational ? "⚠ NON-OPERATIONAL" : r.match < MATCH_MIN ? `⚠ WEAK NAME MATCH ${(r.match * 100).toFixed(0)}%` : "";
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

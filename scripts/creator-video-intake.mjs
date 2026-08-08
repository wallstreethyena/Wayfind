#!/usr/bin/env node
/**
 * scripts/creator-video-intake.mjs — turn a plain list of
 *   <video url> — <place name>, <city>
 * lines into lib/creatorVideos.js registry entries, with the Google Place ID
 * resolved for each one.
 *
 * WHY THIS EXISTS (2026-08-08). The owner sent ~90 TikTok and Instagram links
 * to add to the creator library. Neither platform permits automated fetching,
 * so the one fact the registry cannot do without — WHICH PLACE a given video
 * is about — cannot be read from the link. A shortcode like `DbtqB6zJ0RG`
 * carries no venue, no city, nothing. Guessing is not an option here: a video
 * attached to the wrong restaurant is a false claim on a surface whose entire
 * value is that its claims are true, and the +0.7 the video adds to that
 * place's Wayfind Score would then be unearned.
 *
 * So the human supplies the one thing only a human can (the place), and this
 * script does everything else: resolve the real Place ID against Google, build
 * the entry, and flag anything ambiguous rather than picking for you.
 *
 * USAGE
 *   node scripts/creator-video-intake.mjs videos.txt > entries.txt
 *
 * INPUT — one per line, blank lines and #comments ignored. The separator can
 * be an em dash, a hyphen, or a tab; the city is optional but strongly advised
 * (it is what disambiguates "Joy Coffee" in three counties):
 *
 *   https://www.tiktok.com/@manateelittlelocals/video/7638... — Ryan's Coffee House, Parrish
 *   https://www.instagram.com/p/DbtqB6zJ0RG/ — Circles Waterfront, Bradenton
 *
 * OUTPUT — paste-ready CURATED[] entries, plus a report of every line that
 * could not be resolved, with the reason. Nothing is invented: a place Google
 * cannot find is reported, never guessed, and a query that returns two
 * plausible matches is reported as ambiguous rather than silently taking the
 * first.
 *
 * REQUIRES: GOOGLE_MAPS_SERVER_KEY (or GOOGLE_PLACES_KEY) in the environment,
 * the same key the app's own /api/places/search uses.
 */
import { readFileSync } from "node:fs";

const KEY = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_MAPS_KEY;
const FILE = process.argv[2];

if (!FILE) {
  console.error("usage: node scripts/creator-video-intake.mjs <list.txt>");
  process.exit(2);
}
if (!KEY) {
  console.error("ERROR: set GOOGLE_MAPS_SERVER_KEY (or GOOGLE_PLACES_KEY) — this script resolves real Place IDs and will not fabricate one.");
  process.exit(2);
}

// ── parse ───────────────────────────────────────────────────────────────────
// Split on the FIRST separator only, so a place name containing a hyphen
// ("Bee-Ridge Diner") survives intact.
const SEP = /\s+[—–-]\s+|\t+/;
const lines = readFileSync(FILE, "utf8").split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const rows = [];
const bad = [];
for (const line of lines) {
  const m = line.match(/^(https?:\/\/\S+?)\/?(?:\s|$)/);
  if (!m) { bad.push({ line, why: "no URL found at the start of the line" }); continue; }
  const url = m[1];
  const rest = line.slice(m[0].length).replace(SEP, "").trim() || line.slice(m[0].length).trim();
  if (!rest) { bad.push({ line, why: "no place name — the URL alone cannot say which venue this is" }); continue; }
  const parts = rest.split(",").map((s) => s.trim()).filter(Boolean);
  const name = parts[0];
  const city = parts[1] || "";
  if (!name) { bad.push({ line, why: "no place name after the separator" }); continue; }
  const platform = /tiktok\.com/i.test(url) ? "tiktok" : /instagram\.com/i.test(url) ? "instagram" : null;
  if (!platform) { bad.push({ line, why: "unrecognised platform (expected tiktok.com or instagram.com)" }); continue; }
  const cm = url.match(/@([A-Za-z0-9._]+)/);
  rows.push({ url, name, city, platform, creator: cm ? cm[1] : null });
}

// ── resolve ─────────────────────────────────────────────────────────────────
// Places API (New) Text Search. Asked for a handful of candidates rather than
// one, so a genuinely ambiguous query can be REPORTED as ambiguous instead of
// resolving to whichever row Google happened to rank first.
async function resolve(name, city) {
  const textQuery = city ? `${name}, ${city}, FL` : name;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.businessStatus",
    },
    body: JSON.stringify({ textQuery, maxResultCount: 5, languageCode: "en" }),
  });
  if (!r.ok) throw new Error(`Places API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return Array.isArray(d.places) ? d.places : [];
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const out = [];
const unresolved = [];
for (const row of rows) {
  let cands = [];
  try { cands = await resolve(row.name, row.city); }
  catch (e) { unresolved.push({ ...row, why: "Places API error: " + e.message }); continue; }

  if (!cands.length) { unresolved.push({ ...row, why: `Google returned nothing for "${row.name}${row.city ? ", " + row.city : ""}"` }); continue; }

  const want = norm(row.name);
  // An exact normalised name match wins outright. Otherwise prefer a candidate
  // whose name STARTS with the query (prefix beats substring — the same
  // tiebreak lib/creatorVideos.js PASS 2 uses).
  const exact = cands.filter((c) => norm(c.displayName && c.displayName.text) === want);
  const prefix = cands.filter((c) => norm(c.displayName && c.displayName.text).startsWith(want));
  const pool = exact.length ? exact : prefix.length ? prefix : cands;

  if (pool.length > 1 && !exact.length) {
    unresolved.push({
      ...row,
      why: "AMBIGUOUS — " + pool.slice(0, 3).map((c) => `${c.displayName && c.displayName.text} (${c.formattedAddress})`).join(" | ") + ". Add the city, or the street, to disambiguate.",
    });
    continue;
  }

  const p = pool[0];
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") {
    unresolved.push({ ...row, why: `Google reports this place as ${p.businessStatus} — do not attach a video to a closed venue` });
    continue;
  }
  out.push({ ...row, placeId: p.id, resolvedName: p.displayName && p.displayName.text, address: p.formattedAddress, rating: p.rating, reviews: p.userRatingCount, types: p.types || [] });
}

// ── emit ────────────────────────────────────────────────────────────────────
const key = (r) => norm(r.resolvedName).replace(/\s+/g, "-") + (r.city ? "-" + norm(r.city).replace(/\s+/g, "-") : "");
const CAT = (types) => {
  const t = (types || []).join(" ");
  if (/restaurant|cafe|coffee|bakery|bar|food|meal/.test(t)) return "Food";
  if (/night_club|bar/.test(t)) return "Nightlife";
  if (/lodging|hotel/.test(t)) return "Stays";
  if (/store|shopping/.test(t)) return "Shopping";
  return "Activities";
};

console.log(`// creator-video-intake — ${out.length} resolved, ${unresolved.length + bad.length} needing attention`);
console.log(`// Generated ${new Date().toISOString().slice(0, 10)}. Paste into the CURATED array in lib/creatorVideos.js.`);
console.log("");
for (const r of out) {
  console.log(`  { key: ${JSON.stringify(key(r))}, placeId: ${JSON.stringify(r.placeId)}, match: { name: ${JSON.stringify(r.resolvedName)}, city: ${JSON.stringify(r.city || "")} }, displayName: ${JSON.stringify(r.resolvedName)},`);
  console.log(`    address: ${JSON.stringify(r.address || "")}, category: ${JSON.stringify(CAT(r.types))},`);
  console.log(`    videos: [{ platform: ${JSON.stringify(r.platform)}, url: ${JSON.stringify(r.url)}, creator: ${JSON.stringify(r.creator || "")}, caption: "TODO — one honest sentence about what the creator shows." }] },`);
}

if (unresolved.length || bad.length) {
  console.log("");
  console.log("// ── NEEDS A HUMAN ──────────────────────────────────────────");
  for (const b of bad) console.log(`// SKIPPED  ${b.line}\n//          ${b.why}`);
  for (const u of unresolved) console.log(`// UNRESOLVED  ${u.url}\n//             "${u.name}${u.city ? ", " + u.city : ""}" — ${u.why}`);
}

console.error(`creator-video-intake: ${out.length} resolved, ${unresolved.length} unresolved, ${bad.length} unparseable`);

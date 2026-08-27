#!/usr/bin/env node
/**
 * ingest-verified-2026-08-27 — the owner's creator-post batch (2026-08-27).
 *
 * Source: ten places the owner pulled from Instagram posts he had commented
 * on, delivered via Cowork with his own card editorials and six proposed
 * rails. His own instruction led this batch: "verify the exact location/branch
 * before publishing any location-specific card."
 *
 * That verification is the entire story. Resolved against Google Places v1
 * (searchText, then Details on each candidate) on 2026-08-27:
 *
 *   THREE are real, operational Florida places  → ingested here.
 *   SEVEN are not, for five different reasons   → held, with the reason.
 *
 * The holds are not a failure of the batch; they are the batch working. A
 * Florida discovery app that ships a card for a pizzeria in New Jersey has
 * not been generous, it has published something a reader cannot act on. Each
 * hold below reuses the vocabulary the 2026-08-26 batch established, so the
 * two runs read as one register rather than two improvised ones.
 *
 * WHAT CHANGED ABOUT "DEAD COCONUT CLUB". The owner listed it as a venue. It
 * is not one: it is the seasonal Halloween overlay OF the Red Coconut Club on
 * CityWalk's upper level, themed "Dead Coconut Club – Harvest" for HHN 35 and
 * running select event nights 2026-08-28 → 2026-11-01. So the PLACE card is
 * Red Coconut Club — a real, year-round, operational venue — and the overlay
 * is a seasonal fact stated on it with its dates, which the card stops
 * claiming when they pass. A card whose entire identity is a two-month
 * costume becomes a lie in December.
 *
 * The genuinely useful fact, sourced, that the owner's draft did not have:
 * the overlay is FREE, all ages, and needs NO HHN ticket. That is the line
 * that makes the card worth tapping, and it is why "Halloween energy before
 * you even enter the main event" — his phrase — is true rather than hopeful.
 * Source: hauntedattractionnetwork.com/dead-coconut-club-harvest-hhn-2026/,
 * corroborated by wdwnt.com and universalparksblog.com (2026-07).
 *
 *   node scripts/ingest-verified-2026-08-27.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-08-27.mjs --commit   # write
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPlaceFields } from "../lib/seedPlaces.js";
import { classifyPlace } from "../lib/placeTaxonomy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");

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

// ── The editorials — WAYFIND-OWNED TEXT ─────────────────────────────────────
// The owner's own lines, kept in his voice, with two disciplines applied:
//
//   1. NOTHING DATED SURVIVES ON A PLACE CARD. His Quiero line leaned on a
//      Feeding Tampa Bay giveaway and his Hermanitas line on Halloween drinks.
//      A card that says "the giveaway makes it worth it" is wrong the week the
//      giveaway ends, and the card-hook law keeps promo copy off place cards
//      for exactly that reason. (Both places are held below anyway, but the
//      rule is why the surviving three read the way they do.)
//   2. NOTHING IS CLAIMED THAT THE PROVIDER CONTRADICTS. Every line was
//      checked against the resolved Google record — types, status, and the
//      venue's own site where it has one.
const E = {
  bookLounge:
    "Books, wine and a properly assembled snack board, in one room on Central Avenue. The Book Lounge reads less like going out and more like finding somewhere to disappear for a couple of hours — which is what makes it such a good call for a relaxed girls' night or an unhurried date. Browse first, order second, stay longer than you planned.",
  redCoconut:
    "The bi-level lounge on CityWalk's upper level, with DJs, live bands and bar bites — the CityWalk stop that is actually a night out rather than a queue. Each fall it becomes the Dead Coconut Club: for HHN 35 that is \"Harvest\", running select event nights from August 28 to November 1, 2026, and it is free, all ages, and open whether or not you hold a Horror Nights ticket. That last part is the reason to come early.",
  laHacienda:
    "Come hungry. The Irlo Bronson bakery deals in oversized, heavily loaded sweets that are unapologetically excessive in the best possible way — the kind of dessert you photograph first and work out how to eat second. Go for the thing you would not order anywhere else, not for a quiet coffee and a croissant.",
};

// ── NEW places — resolved and Details-checked 2026-08-27 ────────────────────
// `q` carries the full street address so searchText cannot drift to a
// same-name business elsewhere, and `center` biases within 30km on top of it.
const NEW_PLACES = [
  { key: "bookLounge", q: "The Book Lounge, 631 Central Ave, St. Petersburg, FL 33701",
    name: "The Book Lounge", metro: "tampa", wantCategory: "food",
    center: { latitude: 27.7714, longitude: -82.6423 } },
  { key: "redCoconut", q: "Red Coconut Club, 6000 Universal Blvd, Orlando, FL 32819",
    name: "Red Coconut Club", metro: "orlando", wantCategory: "nightlife",
    center: { latitude: 28.4732, longitude: -81.4651 } },
  { key: "laHacienda", q: "La Hacienda Bakery, 4565 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34746",
    name: "La Hacienda Bakery", metro: "orlando", wantCategory: "food",
    center: { latitude: 28.3106, longitude: -81.4650 } },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.types", "places.primaryType", "places.location", "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus", "places.photos"].join(",");

async function searchText(q, center) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: 3, ...(center ? { locationBias: { circle: { center, radius: 30000 } } } : {}) }),
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

// THE EXPECTED ID, PINNED PER PLACE. searchText with a full street address is
// already tight, but "tight" is not "verified": this batch exists because the
// owner asked for the exact branch to be confirmed, and a resolver that
// silently returns the wrong La Hacienda would defeat the whole point. The id
// below is the one measured on 2026-08-27; a mismatch is a HARD FLAG, not a
// warning, so an ambiguous brand can never quietly become the wrong shop.
const EXPECT = {
  bookLounge: "ChIJ-6hlLADhwogRNUZF-kQBGAI",
  redCoconut: "ChIJwZ_GK-d-54gRm5Ahg7PZYeY",
  laHacienda: "ChIJGwOtw9aD3YgRHJ4E8c7Iqn4",
};

const report = { created: [], flagged: [], unresolved: [], holds: [] };

console.log(`\ningest-verified-2026-08-27 ${COMMIT ? "(COMMIT)" : "(DRY RUN)"}\n`);

// ── 1. Resolve + stage ──────────────────────────────────────────────────────
const staged = [];
for (const c of NEW_PLACES) {
  const hits = await searchText(c.q, c.center);
  const best = hits[0] || null;
  const f = best ? extractPlaceFields(best) : null;
  const match = f ? nameMatch(c.name, f.name) : 0;
  const operational = f && (!f.status || f.status === "OPERATIONAL");
  const addr = (best && best.formattedAddress) || "";
  const expected = EXPECT[c.key];
  if (!f || match < 0.6 || !operational || f.place_id !== expected) {
    const why = !f ? "no result"
      : f.place_id !== expected ? `place_id drift — expected ${expected}, got ${f.place_id} (${f.name})`
      : match < 0.6 ? "name mismatch → " + f.name
      : "status " + f.status;
    report.flagged.push({ want: c.name, got: f && f.name, match, status: f && f.status, addr, why });
    console.log(`  ⚠ ${c.name}: FLAGGED (${why}) — not staged`);
    continue;
  }
  const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(f.place_id)}&select=place_id,name,editorial`, { headers: H }).then((r) => r.json());
  const { category, tags } = classifyPlace(f.google_types, f.primary_type, f.name) || {};
  if (category && category !== c.wantCategory) {
    console.log(`  ⚑ ${c.name}: provider classification "${category}" differs from approved intent "${c.wantCategory}" — using the owner-approved category, flagged for visibility`);
    report.flagged.push({ want: c.name, why: `classifier says ${category}, spec says ${c.wantCategory} (spec used; row locked)`, soft: true });
  }
  const row = {
    place_id: f.place_id, name: f.name, lat: f.lat, lng: f.lng,
    category: c.wantCategory, tags: tags || [], google_types: f.google_types,
    primary_type: f.primary_type, metro: c.metro,
    signals: { rating: f.rating, reviews: f.reviews, price: f.price, priceNum: f.priceNum },
    editorial: E[c.key], photo_ref: f.photo_ref ?? null,
    status: f.status ?? "OPERATIONAL", anchor: false, source: "owner-verified",
    needs_review: false, last_verified_at: nowIso, locked: true,
  };
  staged.push({ c, row, addr, match, already: Array.isArray(dup) && dup.length > 0 });
  console.log(`  ${dup.length ? "↻" : "＋"} ${c.name.padEnd(20)} → "${f.name}"  [${f.status || "OPERATIONAL"}]  match=${(match * 100).toFixed(0)}%  ${addr}`);
}

// ── 2. The seven that are not Florida place cards ───────────────────────────
// Each carries the measurement that produced it, so nobody re-resolves the
// same name next month and reaches a different conclusion by guessing.
report.holds.push(
  { name: "Pizzas Patos", status: "OUT_OF_MARKET",
    note: "Resolved to Patos Pizzas, Patos de Minas / Uberlândia, Minas Gerais, BRAZIL (ChIJW6dPVo71rpQRaE55o6eHWUA, ChIJGd48SWNFpJQRg0PSBmKx_FA). Two searches, both Brazilian, none in Florida. Research archive only — must never enter a Florida rail." },
  { name: "Brother Bruno's Pizza, Deli & Bagels", status: "OUT_OF_MARKET",
    note: "ChIJkSQPf539wokRMWt15Ub6os4 — 200 Hamburg Tpke, Wayne, NEW JERSEY (4.3/812). The owner's own tag said 'NJ Icon'. Proposed for the 'Worth the Drive' rail, whose axis is a 45-minute drive from the reader; this is ~1,100 miles." },
  { name: "The Honeybear Cafe", status: "OUT_OF_MARKET",
    note: "ChIJ_bvTDB7RD4gRbEeJ_cVVOdE — 7036 N Clark St, CHICAGO IL (4.5/2888). The tiramisu pancakes are the Chicago location. Florida-biased search returned only unrelated businesses (Honey Bear Bake Co. Wauchula, Honey Tree Cafe Sarasota, The Honeybee Café Gainesville) — none is this." },
  { name: "Black Tap", status: "CLOSED_PERMANENTLY",
    note: "The only Florida location, Black Tap Craft Burgers & Beer Miami (ChIJmzG8WIO22YgRlvNaVPF79w8), returns businessStatus CLOSED_PERMANENTLY. A Disney Springs search returned City Works, The Edison, T-Rex and D-Luxe Burger — there is no Black Tap there. Nothing in Florida to card." },
  { name: "Quiero Coffee Club", status: "IDENTITY_UNVERIFIED",
    note: "Zero results for the exact name; Florida-biased 'Quiero' returned a Colombian restaurant, an insurance agency and two clothing stores. No trustworthy address or geotag. Needs the Instagram handle or a street address before it can be resolved." },
  { name: "Hermanitas Coffee", status: "IDENTITY_UNVERIFIED",
    note: "No Florida match. Nationwide hits are different businesses (Hermanas Café Atlanta, Las Hermanas DC, Hermanas Cafe AZ); Florida-biased hits are unrelated Hialeah/Miami Gardens cafeterias. Needs the handle or address." },
  { name: "CarnEvil (Universal Orlando seasonal food)", status: "NOT_A_DISTINCT_ENTITY",
    note: "HHN 35 seasonal FOOD inside Universal Studios Florida, not a venue with its own record. Belongs alongside the existing hhn-orlando-2026 row in wf_events, not in place inventory. Same call as the 2026-08-26 'Art the Clown reel' hold." },
);

// ── 3. Dead Coconut Club — resolved to its host venue, not held ─────────────
report.unresolved.push({
  name: "Dead Coconut Club",
  status: "RESOLVED_TO_HOST_VENUE",
  note: "Not a separate venue: the seasonal Halloween overlay of the Red Coconut Club (upper level, Universal CityWalk), themed 'Dead Coconut Club – Harvest' for HHN 35, select nights 2026-08-28 → 2026-11-01, FREE, all ages, no HHN ticket required. Ingested as Red Coconut Club with the overlay stated as a dated fact on the card.",
});

// ── 4. Report, then gate ────────────────────────────────────────────────────
console.log("\n── holds (nothing written) ──");
for (const h of report.holds) console.log(`  ✗ ${h.name.padEnd(38)} ${h.status}`);
for (const u of report.unresolved) console.log(`  ↷ ${u.name.padEnd(38)} ${u.status}`);

const hard = report.flagged.filter((f) => !f.soft);
if (hard.length) {
  console.error("\nHARD FLAGS present — fix them before --commit can write place rows:");
  for (const f of hard) console.error(`  • ${f.want}: ${f.why}`);
  process.exit(1);
}
if (!COMMIT) {
  console.log(`\nDRY RUN — would write ${staged.length} place rows and mirror ${staged.length} ids. Re-run with --commit.`);
  process.exit(0);
}

// place upserts
if (staged.length) {
  const res = await fetch(`${URL_}/rest/v1/wf_inventory?on_conflict=place_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(staged.map((s) => s.row)),
  });
  if (!res.ok) { console.error(`place upsert failed ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
  report.created = staged.map((s) => ({ name: s.row.name, place_id: s.row.place_id, metro: s.row.metro, category: s.row.category }));
  console.log(`  ✓ upserted ${staged.length} place rows`);
}

// wf_place_ids — the allowlist gate for /places/[id]. The 2026-08-26 run
// proved what happens without it: a perfect inventory and every canonical page
// a 404. QA caught it at 6/52 and it is the reason this block exists at all.
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
    console.log(`  ✓ wf_place_ids index: ${invRows.length} ids mirrored — canonical /places pages can serve the batch`);
  }
}

console.log("\n── created ──");
for (const c of report.created) console.log(`  ✓ ${c.name.padEnd(24)} ${c.place_id}  ${c.metro}/${c.category}`);
console.log(`\ndone: ${report.created.length} created, ${report.holds.length} held, ${report.unresolved.length} resolved-to-host.\n`);

#!/usr/bin/env node
/**
 * ingest-verified-2026-08-28 — the owner's creator-comment batch (2026-08-28).
 *
 * Source: six places the owner listed from Instagram posts he had commented
 * on, delivered via Cowork as names only ("Add these to Wayfind"). No
 * addresses, no handles — which makes resolution, not writing, the work.
 *
 * Resolved against Google Places v1 (searchText, then Details on each
 * candidate) on 2026-08-28:
 *
 *   THREE are real, operational Florida places  → ingested here.
 *   THREE are not, for three different reasons  → held, with the measurement.
 *
 * The register is the one the 2026-08-26 and 08-27 batches established: a hold
 * is not a failure, it is the batch working. A Florida discovery app that
 * ships a card for a restaurant in Austin has not been generous — it has
 * published something a reader cannot act on.
 *
 * ONE OF THE THREE IS ALREADY IN INVENTORY. Sea Maids Creamery entered
 * through the older `google_type` sweep with `editorial: null` and
 * `source: google_type`, which means it has been servable but silent — a 9.7
 * card with nothing to say for itself. The owner having independently
 * commented on it is exactly the corroboration the creator rules reward, so
 * this run upgrades the row rather than skipping it: owner-verified source,
 * a real editorial, and refreshed signals. That is the whole point of a
 * harvest meeting an existing library.
 *
 * WHAT "ETHOS" TURNED OUT TO BE. The owner listed it as Austin, Texas, which
 * is already out of market. The reason it is written up rather than dropped in
 * one line is the Florida namesake: Ethos Vegan Kitchen in Winter Park is a
 * place Wayfind readers would recognise, and it is CLOSED_PERMANENTLY. So the
 * answer to "is there a Florida Ethos we could card instead" is a measured no,
 * not an unchecked one, and nobody has to ask again next month.
 *
 *   node scripts/ingest-verified-2026-08-28.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-08-28.mjs --commit   # write
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
// Same two disciplines as the 08-27 batch:
//   1. NOTHING DATED SURVIVES ON A PLACE CARD — no promos, no seasons, and no
//      review counts or star ratings written into prose, because those move
//      and the card would quietly become wrong.
//   2. NOTHING IS CLAIMED THAT THE PROVIDER CONTRADICTS. Every line below was
//      checked against the resolved Details record: types, hours shape, price
//      level, status, and the venue's own site where it has one.
// Staff names are deliberately absent even where reviewers volunteer them —
// people leave, and a card that thanks someone by name ages badly.
const E = {
  somebodys:
    "A small corner shop in South St. Pete that behaves like a neighborhood one rather than a destination — order at the counter, then take it out to the back garden, which is the part actually worth staying for. It is a daytime room, not an evening one, and it is in a part of the city most coffee lists never reach. Go for a properly pulled espresso somewhere quiet.",
  mazal:
    "Latin fusion on Hoffner that takes the food as seriously as the room: the ribeye and the lobster ravioli are what regulars come back for, and the pulpo roll is the order if you want to see what the kitchen can actually do. It opens in the late afternoon and runs late, with a lounge side to it — dinner that becomes a night out rather than a table you get moved off. Weekends are when the room fills and the music is on.",
  seamaids:
    "The Seminole Heights creamery where the flavors are invented rather than assembled — there is always a vegan scoop, the affogato is built on espresso that would stand up on its own, and the homemade cookie belongs on top of whatever you ordered. An evening room: it opens when most creameries are thinking about closing, which is exactly when you want it in a Tampa summer.",
};

// ── NEW / UPGRADED places — resolved and Details-checked 2026-08-28 ─────────
// `q` carries the full street address so searchText cannot drift to a
// same-name business elsewhere, and `center` biases within 40km on top of it.
const NEW_PLACES = [
  { key: "somebodys", q: "Somebody's Coffee, 1753 Prescott St S, St. Petersburg, FL 33712",
    name: "Somebody's Coffee", metro: "tampa", wantCategory: "food",
    center: { latitude: 27.7676, longitude: -82.6403 } },
  { key: "mazal", q: "MAZAL Latin Fusion, 4434 Hoffner Ave, Orlando, FL 32812",
    name: "MAZAL Latin Fusion", metro: "orlando", wantCategory: "food",
    center: { latitude: 28.4813, longitude: -81.3200 } },
  { key: "seamaids", q: "Sea Maids Creamery, 4230 N Florida Ave, Tampa, FL 33603",
    name: "Sea Maids Creamery", metro: "tampa", wantCategory: "food",
    center: { latitude: 27.9945, longitude: -82.4600 } },
];

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

// THE EXPECTED ID, PINNED PER PLACE (the 08-27 discipline, kept). searchText
// with a full street address is already tight, but "tight" is not "verified":
// two of the six names in this batch are generic enough ("Ethos", "Somebody's")
// that a resolver WILL return something plausible and wrong if the address
// ever stops matching. A drift is a HARD FLAG, never a warning.
const EXPECT = {
  somebodys: "ChIJIzpHyd7jwogR2NelI36DKgI",
  mazal: "ChIJl_w4DLJj54gRDdqePgoQBUQ",
  seamaids: "ChIJc3x_mGbFwogRENmo9wLf2YM",
};

const report = { created: [], flagged: [], unresolved: [], holds: [] };

console.log(`\ningest-verified-2026-08-28 ${COMMIT ? "(COMMIT)" : "(DRY RUN)"}\n`);

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
  const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(f.place_id)}&select=place_id,name,editorial,source`, { headers: H }).then((r) => r.json());
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

// ── 2. The three that are not Florida place cards ───────────────────────────
// Each carries the measurement that produced it, so nobody re-resolves the
// same name next month and reaches a different conclusion by guessing.
report.holds.push(
  { name: "Ethos (Austin, Texas)", status: "OUT_OF_MARKET",
    note: "The owner's own note placed it in Austin, TX — ~1,100 miles outside the footprint, the same call as Brother Bruno's (NJ) on 2026-08-27. Checked for a Florida alternative rather than assumed: the recognisable Florida namesake, Ethos Vegan Kitchen, 601 S New York Ave, Winter Park (ChIJS733oJJ654gRysFcCVij-90, 4.6/4197), returns businessStatus CLOSED_PERMANENTLY. So there is no Florida Ethos to card either. An Austin-biased search returned Ethos Apartments (ChIJZWymSjGzRIYR4_ByJDmo0ZA), an apartment complex — the restaurant the owner saw is not resolvable from the name alone and would need the Instagram handle, but it is out of market regardless." },
  { name: "Gallagher's Pumpkin and Christmas Tree's patch", status: "SEASONAL_NOT_YET_OPEN",
    note: "ChIJO4wiQV3hwogRNncNJo43D5U — 7401 4th St N, St. Petersburg, FL (4.2/546). Real, Florida, and the owner is right that it belongs on Wayfind eventually — but it returns businessStatus CLOSED_TEMPORARILY today, because a pumpkin patch in August is between seasons. Two separate bars fail: the ingest gate requires OPERATIONAL, and 4.2/546 scores 8.3, below the 9.2 promotion bar, so it could never rank organically anyway. The honest shape for this one is a DATED seasonal listing on the fall rail once its 2026 opening dates are published by the operator — and per v8.81 (#1008) Wayfind may not carry a date it cannot verify, so it waits for a real source rather than last year's dates." },
  { name: "Italian restaurant — 'free food for a year'", status: "IDENTITY_UNVERIFIED",
    note: "The owner reports the restaurant's name was not visible in the screenshot he was working from, so there is nothing to resolve: no name, no address, no handle. Not searched on the giveaway phrasing on purpose — 'free food for a year' is a promotion, and matching a place by its promo is how you card the wrong restaurant. Needs the Instagram handle or post URL. Note for whoever picks it up: even once identified, the giveaway itself may not appear on the place card (card-hook law — nothing dated survives on a place card); it would be the reason to look, not the copy." },
);

// ── 3. Report, then gate ────────────────────────────────────────────────────
console.log("\n── holds (nothing written) ──");
for (const h of report.holds) console.log(`  ✗ ${h.name.padEnd(46)} ${h.status}`);
for (const u of report.unresolved) console.log(`  ↷ ${u.name.padEnd(46)} ${u.status}`);

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
  report.created = staged.map((s) => ({ name: s.row.name, place_id: s.row.place_id, metro: s.row.metro, category: s.row.category, upgraded: s.already }));
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
for (const c of report.created) console.log(`  ${c.upgraded ? "↻" : "✓"} ${c.name.padEnd(46)} ${c.place_id}  ${c.metro}/${c.category}`);
console.log(`\ndone: ${report.created.length} written (${report.created.filter((c) => c.upgraded).length} upgraded in place), ${report.holds.length} held.\n`);

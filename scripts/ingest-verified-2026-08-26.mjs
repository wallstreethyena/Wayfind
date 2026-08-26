#!/usr/bin/env node
/**
 * ingest-verified-2026-08-26 — the owner's verified-location batch (2026-08-26).
 *
 * Source: owner-approved ingestion spec delivered via Cowork, with per-place
 * 80-word Wayfind editorials. THIS SCRIPT DECIDES NOTHING NEW — every place
 * below was approved by the owner; the script's job is canonical resolution,
 * deduplication, editorial attachment and provenance, through the same
 * pipeline shapes seed-anchors.mjs and seed-fall-2026.mjs already use.
 *
 * The rules it enforces, from the spec:
 *   • Resolve through the authorized provider (Google Places searchText with
 *     the supplied address), never scrape, never invent coordinates.
 *   • Dedupe BEFORE creating: rows that already exist (AVA MediterrAegean,
 *     Lady and the Mug, Café Rialto — measured 2026-08-26) get an editorial
 *     PATCH, not a second row. Café Rialto was commented twice and must stay
 *     ONE canonical row — the PATCH-by-place_id path guarantees it.
 *   • Editorial is Wayfind-owned text in the existing `editorial` column,
 *     separate from provider descriptions; verified_at equivalent =
 *     `last_verified_at`; provenance = `source: "owner-verified"` +
 *     `locked: true` (repair/re-classification treats locked rows as sacred).
 *   • A brand with multiple branches is never one point: El Cilantrillo's
 *     reel did not establish a branch, so it returns BRANCH_UNRESOLVED and
 *     writes nothing (the existing Florida Mall row is left untouched).
 *   • Event cards are events, not places: HHN35 updates the EXISTING
 *     hhn-orlando-2026 row (dedupe — verified dates already match); the
 *     Sideshow Obscura Tribute Store is a new wf_events row with NO invented
 *     end date (Universal has not published one; verify_note says so).
 *   • Research holds write NOTHING and are printed in the completion report:
 *     Smack'd Goods (VENDOR_HOLD — no public storefront, no coordinates may
 *     be fabricated), The Garden Brunch Café (OUT_OF_MARKET — Barcelona,
 *     must never enter Florida rails), the spooky-café reel
 *     (IDENTITY_UNVERIFIED), and the Art the Clown reel (NOT_A_DISTINCT_ENTITY
 *     — social discovery pointing at HHN, not event inventory).
 *
 *   node scripts/ingest-verified-2026-08-26.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-08-26.mjs --commit   # write
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
if (miss.length) { console.error("ingest-verified: missing env: " + miss.join(", ")); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const nowIso = new Date().toISOString();

// ── The owner's editorials, verbatim (Wayfind-owned text) ───────────────────
const E = {
  johnnyCubano: "Johnny Cubano is a strong pick for a grown-up Jacksonville night out when you want more than a standard bar. The Gate Parkway lounge combines cigars, cocktails, hookah, live entertainment and a full dinner menu, with dishes such as wings, ribeye, salmon and kebabs. Its extensive humidor gives cigar fans a real reason to visit, while the food and drink program makes it workable for groups with mixed interests. Go for an unhurried evening rather than a quick stop there.",
  ava: "AVA MediterrAegean turns dinner in Winter Park into a full evening out. The Park Avenue restaurant describes itself as a modern Greek agora, pairing Aegean and Cycladic-inspired cooking with a polished, lively dining room. The menu ranges from mezze and grilled seafood to truffle pasta and whole-lobster linguine, while weekend brunch and late-night lounge hours extend the experience beyond dinner. Choose AVA when the setting matters as much as the meal, especially for date night or a celebration together there.",
  sesame: "Sesame Bakery is where a French boulangerie approach meets Mediterranean flavor in North Miami. The bakery prepares pastries and brunch dishes daily, with options ranging from croissants and baguette sandwiches to shakshuka, salads and specialty coffee. It also states that its kitchen is seed-oil free. The Solé Mia location works especially well for breakfast, a coffee meeting or a pastry run that feels more considered than routine. Go when you want craftsmanship without committing to a formal meal nearby today.",
  ladyMug: "Lady & The Mug is a Tampa coffee stop built around personality rather than a generic café formula. The woman-owned shop serves espresso drinks, cold brew, teas, breakfast and pastries, including vegan and gluten-free options, while rotating seasonal drinks keep the menu changing. Its whimsical interior, varied seating and dedicated quiet room make it useful for both catching up and getting work done. Go when you want a café that feels playful, local and intentionally designed instead of purely functional.",
  rialto: "Café Rialto gives Tampa coffee drinkers something most cafés cannot: a historic theater as the backdrop. Located inside the Rialto Theatre on North Franklin Street, the walk-in café shares the landmark with an event venue and a reservations-only afternoon tearoom. Recent local coverage notes King State coffee, house-made pastries and an Old Hollywood-inspired atmosphere. Go for the setting as much as the drink—the appeal is having a coffee break inside one of Tampa Heights' most distinctive historic spaces downtown today.",
  susHi: "Sus Hi Eatstation is built for people who want sushi without the pace or formality of a sit-down sushi bar. The Tampa location near USF serves made-to-order sushi bowls, poke bowls, burritos and rolls, with a build-your-own format that lets guests control the base, proteins and toppings. The concept was founded in Orlando in 2011 and uses a playful ninja-themed identity. Go when you want something customizable, quick and more interesting than the usual fast-casual lunch near campus today too.",
  elCilantrillo: "El Cilantrillo is a Central Florida destination for Puerto Rican food served with scale, energy and a strong sense of culture. Founded in 2017, the restaurant group focuses on traditional dishes such as mofongo, pernil, churrasco, fried plantains and seafood, and its locations use murals, portraits and island-inspired design. Portions are designed generously, making it particularly suited to families and groups. Go when you want a lively meal centered on Puerto Rican flavors rather than a quiet, minimalist dining experience.",
  hhn35: "Halloween Horror Nights 35 is one of Orlando's biggest fall commitments, not a quick seasonal add-on. Universal Studios Florida transforms into the \"Infernal Carnival of Nightmares\" for select nights from August 28 through November 1, 2026, with 10 new haunted houses, scare zones, live entertainment, themed food and merchandise. Jack the Clown and Dr. Oddfellow headline the anniversary year. Go if you want a separately ticketed, after-dark Halloween event built around immersive horror rather than a family-friendly fall atmosphere tonight.",
  sideshow: "Sideshow Obscura is the 2026 Halloween Horror Nights Tribute Store at Universal Studios Florida, opening August 26 near Revenge of the Mummy. Universal describes it as a haunting traveling sideshow filled with eerie oddities, creatures, backstage spaces and a chilling midway, with exclusive merchandise tied to HHN's 35th anniversary. Because it sits inside Universal Studios Florida, valid park access is required. Go for elaborate seasonal theming, photo-worthy details and limited-edition Halloween Horror Nights merchandise during the daytime this fall season.",
};

// ── NEW places (measured absent from wf_inventory on 2026-08-26) ────────────
const NEW_PLACES = [
  { key: "johnnyCubano", q: "Johnny Cubano Cigar Lounge, 7860 Gate Pkwy, Jacksonville, FL 32256",
    name: "Johnny Cubano", metro: "jacksonville-fl", wantCategory: "nightlife",
    center: { latitude: 30.2549, longitude: -81.5225 } },
  { key: "sesame", q: "Sesame Bakery, 2211 Sole Mia Sq Ln, North Miami, FL 33181",
    name: "Sesame Bakery", metro: "miami", wantCategory: "food",
    center: { latitude: 25.9096, longitude: -80.1499 } },
  { key: "susHi", q: "Sus Hi Eatstation, 2309 E Fowler Ave, Tampa, FL 33612",
    name: "Sus Hi Eatstation", metro: "tampa", wantCategory: "food",
    center: { latitude: 28.0547, longitude: -82.4383 } },
];

// ── EXISTING rows: editorial attach only (canonical IDs measured 2026-08-26) ─
const EDITORIAL_ONLY = [
  { key: "ava", place_id: "ChIJLWQ9xoZx54gRgT08_-0eAM4", name: "AVA MediterrAegean Winter Park" },
  { key: "ladyMug", place_id: "ChIJiQg4SH7FwogRREQj9LKv9JA", name: "Lady and the Mug Specialty Coffee Shop" },
  { key: "rialto", place_id: "ChIJ69YTzXPFwogRRTUQ-HGDL7g", name: "Café Rialto" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.types", "places.primaryType", "places.location", "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus", "places.photos"].map((f) => f).join(",");

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

const report = { created: [], patched: [], flagged: [], unresolved: [], holds: [], events: [] };

// ── 1. Resolve + stage the new places ───────────────────────────────────────
const staged = [];
for (const c of NEW_PLACES) {
  const hits = await searchText(c.q, c.center);
  const best = hits[0] || null;
  const f = best ? extractPlaceFields(best) : null;
  const match = f ? nameMatch(c.name, f.name) : 0;
  const operational = f && (!f.status || f.status === "OPERATIONAL");
  const addr = (best && best.formattedAddress) || "";
  if (!f || match < 0.6 || !operational) {
    report.flagged.push({ want: c.name, got: f && f.name, match, status: f && f.status, addr, why: !f ? "no result" : match < 0.6 ? "name mismatch" : "not operational" });
    console.log(`  ⚠ ${c.name}: FLAGGED (${!f ? "no result" : match < 0.6 ? "name mismatch → " + f.name : "status " + f.status}) — not staged`);
    continue;
  }
  // Existing-row dedupe by canonical id, run at ingest time (not just against
  // the 2026-08-26 snapshot above): if the id is already present, this place
  // moves to the PATCH path instead of a create.
  const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(f.place_id)}&select=place_id,name,editorial`, { headers: H }).then((r) => r.json());
  const { category, tags } = classifyPlace(f.google_types, f.primary_type, f.name) || {};
  const finalCategory = c.wantCategory;
  if (category && category !== c.wantCategory) {
    console.log(`  ⚑ ${c.name}: provider classification "${category}" differs from approved intent "${c.wantCategory}" — using the owner-approved category, flagged for visibility`);
    report.flagged.push({ want: c.name, why: `classifier says ${category}, spec says ${c.wantCategory} (spec used; row locked)`, soft: true });
  }
  const row = {
    place_id: f.place_id, name: f.name, lat: f.lat, lng: f.lng,
    category: finalCategory, tags: tags || [], google_types: f.google_types,
    primary_type: f.primary_type, metro: c.metro,
    signals: { rating: f.rating, reviews: f.reviews, price: f.price, priceNum: f.priceNum },
    editorial: E[c.key], photo_ref: f.photo_ref ?? null,
    status: f.status ?? "OPERATIONAL", anchor: false, source: "owner-verified",
    needs_review: false, last_verified_at: nowIso, locked: true,
  };
  staged.push({ c, row, addr, match, already: Array.isArray(dup) && dup.length > 0 });
  console.log(`  ${dup.length ? "↻" : "＋"} ${c.name.padEnd(24)} → "${f.name}"  [${f.status || "OPERATIONAL"}]  match=${(match * 100).toFixed(0)}%  ${addr}`);
}

// ── 2. El Cilantrillo — branch resolution attempt, then honest failure ──────
{
  const hits = await searchText("El Cilantrillo Restaurant, Orlando, FL", { latitude: 28.5384, longitude: -81.3789 });
  const branches = hits.map((p) => `${(p.displayName && p.displayName.text) || "?"} — ${p.formattedAddress || "?"}`);
  // The reel carried no geotag or caption address (checked at intake); Google
  // and the official site both list MULTIPLE branches; the one row already in
  // wf_inventory (Florida Mall) proves nothing about which branch was filmed.
  report.unresolved.push({ name: "El Cilantrillo", status: "BRANCH_UNRESOLVED", branches });
  console.log(`  ✗ El Cilantrillo: BRANCH_UNRESOLVED — ${branches.length} branches from the provider; no geotag/caption/first-party pin. Nothing written; editorial held.`);
}

// ── 3. Research holds — write nothing, report everything ────────────────────
report.holds.push(
  { name: "Smack'd Goods (Orlando)", status: "VENDOR_HOLD", note: "No public storefront; pickup/delivery only. No coordinates may be fabricated. Revisit if a stable public pickup location is verified." },
  { name: "The Garden Brunch Café", status: "OUT_OF_MARKET", note: "Barcelona, Spain. Must never enter Florida rails; research archive only." },
  { name: "Spooky coffee shop reel", status: "IDENTITY_UNVERIFIED", note: "No trustworthy business name, address, or geotag. Waiting on a confirmed identity." },
  { name: "Art the Clown reel", status: "NOT_A_DISTINCT_ENTITY", note: "Social discovery pointing at Halloween Horror Nights; no first-party source for a distinct 2026 Orlando Art experience. No record created." },
);
for (const h of report.holds) console.log(`  ◻ ${h.name}: ${h.status}`);

// ── 4. Events ───────────────────────────────────────────────────────────────
// HHN 35: the row EXISTS (hhn-orlando-2026) and its dates already equal the
// verified dates (2026-08-28 → 2026-11-01, measured). Dedupe = update in
// place: attach the owner's editorial and refresh verification. The events
// feed's date filtering is what retires it after Nov 1 — end_date is the law.
const hhnPatch = {
  editorial_summary: E.hhn35,
  last_verified_at: nowIso,
  verify_note: "Dates re-verified 2026-08-26 against Universal's official 2026 releases (Aug 28 - Nov 1; 10 houses; Jack the Clown & Dr. Oddfellow).",
};
// Sideshow Obscura: NEW event row. Venue identity is reused from the verified
// HHN row (same park), coordinates included — never derived from editorial.
// NO end_date: Universal has not published one, and the spec forbids
// fabricating it; verify_note carries that state.
const sideshowRow = {
  event_id: "sideshow-obscura-hhn35-2026", event_series_id: "hhn-tribute-store",
  event_name: "Sideshow Obscura — HHN35 Tribute Store", short_title: "Sideshow Obscura",
  year: 2026, slug: "sideshow-obscura-hhn35-2026",
  start_date: "2026-08-26", end_date: null,
  timezone: "America/New_York", select_nights: false,
  schedule_note: "Open during regular Universal Studios Florida park hours; valid park admission required. Universal has not published a closing date.",
  event_status: "scheduled",
  venue: "Universal Studios Florida", address: null, city: "Orlando", county: "Orange", state: "FL",
  lat: 28.4749, lng: -81.4664, place_id: "ChIJdd8VlMN-54gRoaU0d_zYhfk",
  category: "seasonal", subcategory: "tribute-store",
  tags: ["fall", "halloween", "theme-park", "shopping", "daytime"],
  audience: ["adults", "families"],
  is_free: false, price_band: "$$$",
  official_event_url: "https://www.universalorlando.com/web/en/us/things-to-do/events/halloween-horror-nights",
  hero_image: "/api/photo?place=ChIJdd8VlMN-54gRoaU0d_zYhfk&w=800",
  card_hook: "HHN's haunted sideshow of oddities you can walk through in daylight.",
  editorial_summary: E.sideshow,
  why_go: "Elaborate seasonal theming, photo-worthy details and limited-edition HHN35 merchandise, without buying an event ticket.",
  skip_if: "You expect a standalone attraction. It is a themed store inside the park; park admission is required.",
  insider_tip: "It sits near Revenge of the Mummy — go early in the day before event crowds build.",
  duration_recommendation: "30-45 minutes", crowd_level: "moderate",
  wayfind_verdict: "The free-with-admission way to taste HHN35's theming in daylight.",
  source_url: "https://media.universalparksusa.com/press-releases/halloween-horror-nights-2026-overview/",
  source_type: "official-organizer", source_tier: 1, verification_confidence: "high",
  last_verified_at: nowIso,
  verify_note: "Opening date (Aug 26, 2026) and location beside Revenge of the Mummy confirmed by Universal. No published end date — do not fabricate one.",
  editorial_score: 6.5, uniqueness_score: 7.0, popularity_score: 6.0,
};

console.log(`\n  staged: ${staged.length} place rows (${staged.filter((s) => s.already).length} already existed → merge), ${EDITORIAL_ONLY.length} editorial patches, 1 event insert, 1 event update`);

if (!COMMIT) { console.log("\nDRY RUN — nothing written. Re-run with --commit."); process.exit(0); }
if (report.flagged.some((f) => !f.soft)) { console.error("\nHARD FLAGS present — fix them before --commit can write place rows."); process.exit(1); }

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
// wf_place_ids index — the allowlist gate for the canonical /places/[id] page
// (app/places/[id]/page.js: an id NOT in this index calls notFound() before any
// Google call). Without this, the batch exists in the library but every one of
// its canonical pages 404s — QA proved exactly that on the first run. Same
// skeleton + merge-duplicates shape as lib/serverCache.upsertPlaceIds.
{
  const seen = new Date(Date.now()).toISOString();
  const ALL_BATCH_IDS = [...staged.map((s) => s.row.place_id), ...EDITORIAL_ONLY.map((p) => p.place_id)];
  const invRows = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=in.(${ALL_BATCH_IDS.map((i) => `"${i}"`).join(",")})&select=place_id,name,lat,lng,category,signals`, { headers: H }).then((r) => r.json());
  if (!Array.isArray(invRows) || invRows.length !== ALL_BATCH_IDS.length) {
    console.error(`index upsert aborted: expected ${ALL_BATCH_IDS.length} inventory rows to mirror, got ${Array.isArray(invRows) ? invRows.length : "error"}`);
    process.exit(1);
  }
  const idx = await fetch(`${URL_}/rest/v1/wf_place_ids`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(invRows.map((r) => ({ place_id: r.place_id, name: r.name, lat: r.lat, lng: r.lng, category: r.category, signals: r.signals, seen_at: seen }))),
  });
  if (!idx.ok) { console.error(`wf_place_ids upsert failed ${idx.status}: ${(await idx.text()).slice(0, 300)}`); process.exit(1); }
  console.log(`  ✓ wf_place_ids index: ${invRows.length} ids mirrored — canonical /places pages can serve the batch`);
}
// editorial patches (existing canonical rows — Café Rialto stays ONE row)
for (const p of EDITORIAL_ONLY) {
  const prev = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(p.place_id)}&select=editorial`, { headers: H }).then((r) => r.json());
  const prevEd = Array.isArray(prev) && prev[0] ? prev[0].editorial : undefined;
  const res = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(p.place_id)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ editorial: E[p.key], source: "owner-verified", locked: true, needs_review: false, last_verified_at: nowIso }),
  });
  if (!res.ok) { console.error(`patch ${p.name} failed ${res.status}`); process.exit(1); }
  report.patched.push({ name: p.name, place_id: p.place_id, replacedEditorial: !!prevEd && prevEd !== E[p.key] });
  console.log(`  ✓ editorial attached: ${p.name}${prevEd && prevEd !== E[p.key] ? "  (replaced prior editorial — prior text preserved in git/DB history)" : ""}`);
}
// events
{
  const r1 = await fetch(`${URL_}/rest/v1/wf_events?event_id=eq.hhn-orlando-2026`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(hhnPatch),
  });
  if (!r1.ok) { console.error(`HHN patch failed ${r1.status}`); process.exit(1); }
  const r2 = await fetch(`${URL_}/rest/v1/wf_events?on_conflict=event_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([sideshowRow]),
  });
  if (!r2.ok) { console.error(`Sideshow insert failed ${r2.status}: ${(await r2.text()).slice(0, 300)}`); process.exit(1); }
  report.events = ["hhn-orlando-2026 (editorial + verification refreshed; dates already correct)", "sideshow-obscura-hhn35-2026 (created; end date deliberately absent)"];
  console.log("  ✓ events: HHN35 updated, Sideshow Obscura created");
}

console.log("\nCOMPLETION REPORT\n" + JSON.stringify(report, null, 2));

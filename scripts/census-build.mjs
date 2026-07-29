// scripts/census-build.mjs — PHASE 2. Build the per-METRO census.
//
// One sweep per metro across EVERYTHING, union first, classify later. Ole Red,
// Tin Roof and The Edison are restaurants that are also nightlife; running one
// retrieval per category drops them in the gap between two sweeps. So category
// is NOT a retrieval parameter here — it is a later, free, materialised pass.
//
// WHAT PHASE 1 CHANGED ABOUT THIS DESIGN
// The primary defect is NOT distance. Coverage fell monotonically with the size
// of the candidate universe (venice 107 -> 7/20 ... orlando-food 750 -> 0/20),
// and Honolulu killed distance outright: Earls Kitchen + Bar, 10,287 reviews,
// 2.8mi from the centroid, inside the 17-mi radius, and missing. A fixed-size
// single query does not scale with the market. District anchoring fixes Orlando
// and does nothing for Honolulu.
// Therefore this sweep is SATURATION-DRIVEN, not fixed-size: it keeps issuing
// queries until marginal yield collapses, and the stopping point is measured
// rather than chosen. "I ran out of patience" is not saturation.
//
// FOUR INDEPENDENT STRATEGIES — no single one is complete (Phase 0 proved it):
//   A  taxonomy   searchNearby + includedTypes (full types[], NOT primaryType —
//                 Sly Fox Pub is primaryType=bar_and_grill with night_club only
//                 in its secondary array, and includedPrimaryTypes would miss it)
//   B  language   searchText, varied phrasings, paged to exhaustion
//   C  landmark   direct resolution of a curated per-city name list. This is what
//                 guarantees the obvious is never missing, and it is cheap.
//   (`dive_bar` reaches NONE of these via type — not in Table A, Places 400s on
//    it. Only B or C can retrieve such a venue. Issue #416.)
//
// RULE 1 — CAPTURE CLASSIFICATION INPUTS NOW. This is the one irreversible
// decision in Phase 2: if the sweep does not store what a future predicate needs,
// the first predicate written forces a paid re-sweep. So the field mask carries
// full types[], primaryType, businessStatus, priceLevel and regularOpeningHours.
// Those cost NOTHING extra: rating+userRatingCount already put every call in the
// Enterprise SKU, and businessStatus/priceLevel/regularOpeningHours are the same
// tier. editorialSummary is DELIBERATELY EXCLUDED — it is the only field here
// that would escalate to Enterprise + Atmosphere ($35 -> $40/1k, +14%), and no
// plausible category predicate needs prose.
//
// RULE 2 — "UNCATEGORISED" IS COUNTABLE, NEVER A SILENT DROP. This script writes
// every row with category:null. A census row no category claims is exactly the
// Ole Red case, and the per-metro uncategorised count is a quality metric.
//
// TWO LIFETIMES (the Phase 3 boundary, surfaced here so the shape is right):
//   place_id            -> storable INDEFINITELY under Google's terms
//   types/rating/hours  -> place CONTENT, capped at 30 days
// Note the consequence for classification: types[] is content and expires, so a
// derived category must be written as OUR OWN label onto the census row. Our
// label is our data and persists; the Google types it was derived from do not.
// Same rule as Phase 5's golden sets.
//
// Usage: node scripts/census-build.mjs --city orlando [--dry]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

function loadKey() {
  if (process.env.GOOGLE_MAPS_SERVER_KEY) return process.env.GOOGLE_MAPS_SERVER_KEY;
  try {
    const m = readFileSync(join(ROOT, ".env.local"), "utf8").match(/^GOOGLE_MAPS_SERVER_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {}
  return null;
}

const CONTAMINATION_MI = 150;

// Districts are a SECONDARY, metro-specific corrective (Phase 1). They are what
// reaches Orlando's 8-15mi venues; they do nothing for Honolulu's 2-3mi misses,
// which saturation-paging is what fixes.
const CITIES = {
  orlando: { lat: 28.5384, lng: -81.3789, metroMi: 35, districts: [
    { key: "disney-springs", lat: 28.3705, lng: -81.5194, radius: 2500 },
    { key: "citywalk",       lat: 28.4726, lng: -81.4694, radius: 2500 },
    { key: "i-drive",        lat: 28.4432, lng: -81.4682, radius: 3000 },
    { key: "downtown",       lat: 28.5421, lng: -81.3790, radius: 2500 },
    { key: "mills-50",       lat: 28.5560, lng: -81.3620, radius: 2500 },
    { key: "winter-park",    lat: 28.5999, lng: -81.3517, radius: 2500 },
    { key: "lake-nona",      lat: 28.3700, lng: -81.2700, radius: 3000 },
    { key: "sand-lake",      lat: 28.4500, lng: -81.4900, radius: 3000 },
  ], landmarks: [
    "Disney Springs Orlando", "Universal CityWalk Orlando", "ICON Park Orlando",
    "House of Blues Orlando", "Hard Rock Live Orlando", "The Beacham Orlando",
    "Wall Street Plaza Orlando", "Dr. Phillips Center Orlando", "Kia Center Orlando",
    "SAK Comedy Lab Orlando", "Twin Peaks Orlando", "Ole Red Orlando",
    "The Edison Orlando", "Tin Roof Orlando", "ICEBAR Orlando",
    "Howl at the Moon Orlando", "Tom's Watch Bar Orlando", "Mango's Tropical Cafe Orlando",
    "Senor Frog's Orlando", "Margaritaville Orlando", "Splitsville Orlando",
    "Raglan Road Irish Pub Orlando", "Paradiso 37 Orlando", "Pointe Orlando",
    "Rosen Centre Orlando", "Amway Center Orlando",
  ]},
};

// Type groups spanning EVERY category, because the census is per metro and not
// per category. Only Table A types (dive_bar excluded — see #416).
const TYPE_GROUPS = [
  ["night_club", "live_music_venue", "concert_hall", "comedy_club", "dance_hall", "karaoke"],
  ["bar", "cocktail_bar", "lounge_bar", "hookah_bar"],
  ["pub", "irish_pub", "brewery", "brewpub", "beer_garden", "gastropub", "sports_bar", "wine_bar"],
  ["restaurant", "fine_dining_restaurant", "steak_house", "seafood_restaurant"],
  ["italian_restaurant", "mexican_restaurant", "japanese_restaurant", "sushi_restaurant", "chinese_restaurant", "thai_restaurant"],
  ["american_restaurant", "breakfast_restaurant", "brunch_restaurant", "pizza_restaurant", "cafe", "bakery"],
  ["tourist_attraction", "amusement_park", "water_park", "zoo", "aquarium", "museum", "art_gallery"],
  ["park", "national_park", "state_park", "beach", "hiking_area", "marina", "golf_course"],
  ["shopping_mall", "department_store", "market", "book_store", "clothing_store"],
  ["performing_arts_theater", "movie_theater", "casino", "bowling_alley", "stadium", "arena"],
];

const PHRASINGS = [
  "best bars and nightlife", "live music venue", "night club", "brewery and taproom",
  "comedy club and entertainment", "rooftop bar", "sports bar",
  "best restaurants", "fine dining", "where to eat dinner", "brunch and breakfast",
  "seafood restaurant", "steakhouse", "food hall",
  "top tourist attractions", "things to do", "museum and gallery", "family attractions",
  "best beaches", "waterfront park", "shopping and boutiques", "live theater and shows",
];

const FIELDS = "places.id,places.displayName,places.primaryType,places.types,places.rating,places.userRatingCount,places.location,places.businessStatus,places.priceLevel,places.regularOpeningHours";
const FIELDS_TEXT = FIELDS + ",nextPageToken";
const MAX_PAGES = 3;
const SATURATION_WINDOW = 12;   // consecutive queries examined
const SATURATION_YIELD = 0.02;  // <2% of queried rows being new == collapsed
// Hard call budget. If it binds, the run says so LOUDLY and reports NOT
// saturated — a truncated sweep must never read as a completed one.
const MAX_CALLS = Number(process.env.CENSUS_MAX_CALLS || 1600);
const MAX_SUBDIV = 2; // subdivision depth when a district refuses to go quiet

let CALLS = { nearby: 0, text: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const priced = () => { const t = CALLS.nearby + CALLS.text; return { ...CALLS, total: t, usd: +(t * 0.035).toFixed(2) }; };

function distMi(a, b) {
  const R = 3958.8, r = (x) => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

class QuotaExhausted extends Error {}

async function post(url, body, mask, key) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask }, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 240);
    // A daily-quota 429 killed a run that had six districts saturated and wrote
    // nothing, because the only write was at the end of main(). ~627 paid calls
    // bought zero durable output. A 429 is now a STOP, not a crash: it unwinds
    // to the checkpoint writer so everything already paid for survives.
    if (r.status === 429) throw new QuotaExhausted(txt);
    throw new Error(`${r.status} ${txt}`);
  }
  return r.json();
}

// ── checkpointing ─────────────────────────────────────────────────────────
// Written after EVERY district. A long sweep must never be one 429 away from
// total loss.
function ckptPath(slug) { return join(ROOT, "tmp", `census-${slug}.checkpoint.json`); }
function saveCheckpoint(slug, districtSaturated, districtCalls) {
  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  writeFileSync(ckptPath(slug), JSON.stringify({
    slug, calls: CALLS, districtSaturated, districtCalls, curve: CURVE,
    rows: [...CENSUS.values()].map((r) => ({ ...r, foundBy: [...r.foundBy] })),
  }));
}
function loadCheckpoint(slug) {
  try {
    const c = JSON.parse(readFileSync(ckptPath(slug), "utf8"));
    for (const r of c.rows) CENSUS.set(r.place_id, { ...r, foundBy: new Set(r.foundBy) });
    CURVE.push(...(c.curve || []));
    CALLS = { ...c.calls };
    console.log(`  RESUMED from checkpoint: ${CENSUS.size} place_ids, ${c.calls.total} calls already paid for`);
    return c;
  } catch { return null; }
}

const CENSUS = new Map();
const CURVE = [];

function absorb(places, strategy, provenance) {
  let fresh = 0, seen = 0;
  for (const p of places || []) {
    if (!p || !p.id) continue;
    seen++;
    if (!CENSUS.has(p.id)) {
      CENSUS.set(p.id, {
        place_id: p.id,
        // RULE 2: category is null and stays null in Phase 2. Classification is
        // a separate, free, materialised pass. Uncategorised is a state.
        category: null,
        // RULE 1: everything a future predicate could need, captured now.
        name: (p.displayName && p.displayName.text) || null,
        primaryType: p.primaryType || null,
        types: p.types || [],
        rating: typeof p.rating === "number" ? p.rating : null,
        reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
        businessStatus: p.businessStatus || null,
        priceLevel: p.priceLevel || null,
        hours: p.regularOpeningHours ? { periods: p.regularOpeningHours.periods || null, weekdayDescriptions: p.regularOpeningHours.weekdayDescriptions || null } : null,
        lat: p.location ? p.location.latitude : null,
        lng: p.location ? p.location.longitude : null,
        distMi: null, inMetro: null,
        foundBy: new Set(), provenance: [],
      });
      fresh++;
    }
    const rec = CENSUS.get(p.id);
    rec.foundBy.add(strategy);
    if (rec.provenance.length < 12) rec.provenance.push(provenance);
  }
  CURVE.push({ q: provenance, strategy, returned: seen, fresh, cumulative: CENSUS.size });
  return fresh;
}

// Marginal yield over the last N queries WITHIN ONE DISTRICT.
//
// The first version of this measured the last N queries globally, and it was
// wrong in a way that looked right: it fired, reported stoppedEarly=true, and
// the metro was nowhere near saturated. A window of 12 consecutive queries can
// sit entirely inside one district's last phrasing — a local trough — while
// other districts remain unswept. The Orlando run stopped inside `sand-lake`,
// which reached 154 place_ids against 685-841 for every other district, and the
// district visited immediately before it (`lake-nona`) still contributed 223
// place_ids no other district reached. A sweep still finding hundreds of unique
// venues per district has not saturated; it ran out of plan.
//
// So saturation is now per-district AND global: every district must individually
// go quiet before the metro is called saturated.
function saturatedIn(districtKey) {
  const w = CURVE.filter((c) => c.q.startsWith("A:" + districtKey + ":") || c.q.startsWith("B:" + districtKey + ":")).slice(-SATURATION_WINDOW);
  if (w.length < SATURATION_WINDOW) return false;
  const seen = w.reduce((a, x) => a + x.returned, 0);
  const fresh = w.reduce((a, x) => a + x.fresh, 0);
  if (seen === 0) return false; // no data is not saturation
  return fresh / seen < SATURATION_YIELD;
}

async function main() {
  const slug = arg("city", "orlando");
  const city = CITIES[slug];
  if (!city) { console.error(`unknown --city ${slug}`); process.exit(1); }

  const nA = city.districts.length * TYPE_GROUPS.length;
  const nB = city.districts.length * PHRASINGS.length * MAX_PAGES;
  const nC = city.landmarks.length;
  console.log(`CENSUS ${slug}: ${city.districts.length} districts x ${TYPE_GROUPS.length} type groups, ${PHRASINGS.length} phrasings, ${nC} landmarks`);
  // Level-0 only. Subdivision multiplies this by up to 9 per level, so the
  // BUDGET is the real ceiling, not this figure — say both rather than let the
  // smaller number read as the cost.
  console.log(`PLAN   level-0 A ${nA} + B ${nB} + C ${nC} = ${nA + nB + nC} calls @ $0.035 = $${((nA + nB + nC) * 0.035).toFixed(2)}`);
  console.log(`       subdivision adds up to ${MAX_SUBDIV} levels (x9 tiles each) where a district will not go quiet`);
  console.log(`       HARD BUDGET ${MAX_CALLS} calls = $${(MAX_CALLS * 0.035).toFixed(2)} — this is the ceiling that actually binds\n`);
  if (DRY) { console.log("--dry: no API calls."); return; }

  const key = loadKey();
  if (!key) { console.error("FATAL: no GOOGLE_MAPS_SERVER_KEY"); process.exit(1); }

  // PREFLIGHT — one call per SKU before committing to a plan of hundreds.
  // Tonight's run discovered the daily SearchTextRequest ceiling 627 calls in.
  // Two calls up front turn that into an immediate, cheap refusal.
  try {
    await post("https://places.googleapis.com/v1/places:searchText",
      { textQuery: "coffee", pageSize: 1, locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 5000 } } }, "places.id", key);
    CALLS.text++;
    await post("https://places.googleapis.com/v1/places:searchNearby",
      { includedTypes: ["cafe"], maxResultCount: 1, locationRestriction: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 5000 } } }, "places.id", key);
    CALLS.nearby++;
    console.log(`  preflight: both SKUs answering (2 calls, $0.07)\n`);
    if (process.argv.includes("--preflight")) { console.log("--preflight: quota is available; stopping before the sweep."); return; }
  } catch (e) {
    if (e instanceof QuotaExhausted) { console.error(`FATAL: quota already exhausted before the sweep started.\n  ${String(e.message).slice(0, 200)}\n  Nothing was swept. Raise the per-day limit or wait for reset.`); process.exit(1); }
    throw e;
  }

  const resumed = process.argv.includes("--resume") ? loadCheckpoint(slug) : null;

  // C — landmarks FIRST. Cheapest, and it guarantees the obvious is present
  // before any saturation rule can stop the sweep early.
  for (const name of (resumed ? [] : city.landmarks)) {
    const data = await post("https://places.googleapis.com/v1/places:searchText",
      // 50000 is Google's hard ceiling: "Radius must be in the range of
      // [0, 50000] inclusively." 60000 returns 400 INVALID_ARGUMENT.
      { textQuery: name, pageSize: 5, locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 50000 } } }, FIELDS_TEXT, key);
    CALLS.text++; absorb(data.places, "C", `C:${name.slice(0, 22)}`); await sleep(110);
  }
  console.log(`  C landmarks: ${CENSUS.size} place_ids after ${CALLS.text} calls`);

  // ── per-district saturation engine ──────────────────────────────────────
  // A district that will not go quiet is SUBDIVIDED rather than abandoned. Both
  // caps that bind here are structural: searchNearby returns at most 20 rows and
  // cannot paginate, and searchText tops out around 60. Smaller circles are the
  // only way past either, so each subdivision level buys a fresh 20/60 per tile.
  const districtSaturated = {}, districtCalls = {};

  function subdivide(d, level) {
    if (level === 0) return [d];
    const tiles = [], step = d.radius / 1.5, r = Math.max(600, d.radius / 2);
    const dLat = step / 111320, dLng = step / (111320 * Math.cos(d.lat * Math.PI / 180));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      tiles.push({ key: `${d.key}/L${level}_${i}${j}`, lat: d.lat + i * dLat, lng: d.lng + j * dLng, radius: r });
    return tiles;
  }

  let budgetHit = false;
  if (resumed) Object.assign(districtSaturated, resumed.districtSaturated || {}, {}), Object.assign(districtCalls, resumed.districtCalls || {});
  let quotaStopped = false;
  for (const d of city.districts) {
    if (districtSaturated[d.key]) { console.log(`  ${d.key.padEnd(16)} already saturated (checkpoint) — skipped`); continue; }
    const before = priced().total;
    try {
    for (let level = 0; level <= MAX_SUBDIV && !districtSaturated[d.key]; level++) {
      for (const tile of subdivide(d, level)) {
        if (priced().total >= MAX_CALLS) { budgetHit = true; break; }
        // A — taxonomy
        for (let gi = 0; gi < TYPE_GROUPS.length; gi++) {
          if (priced().total >= MAX_CALLS) { budgetHit = true; break; }
          const data = await post("https://places.googleapis.com/v1/places:searchNearby",
            { includedTypes: TYPE_GROUPS[gi], maxResultCount: 20, rankPreference: "POPULARITY",
              locationRestriction: { circle: { center: { latitude: tile.lat, longitude: tile.lng }, radius: tile.radius } } }, FIELDS, key);
          CALLS.nearby++; absorb(data.places, "A", `A:${d.key}:${tile.key}:g${gi}`); await sleep(90);
        }
        // B — language, paged
        for (const phrase of PHRASINGS) {
          if (priced().total >= MAX_CALLS) { budgetHit = true; break; }
          let token = null;
          for (let page = 0; page < MAX_PAGES; page++) {
            const data = await post("https://places.googleapis.com/v1/places:searchText",
              { textQuery: phrase, pageSize: 20, locationBias: { circle: { center: { latitude: tile.lat, longitude: tile.lng }, radius: tile.radius } }, ...(token ? { pageToken: token } : {}) }, FIELDS_TEXT, key);
            CALLS.text++; absorb(data.places, "B", `B:${d.key}:${tile.key}:${phrase.slice(0, 14)}:p${page}`);
            token = data.nextPageToken || null; await sleep(90);
            if (!token) break;
          }
          if (saturatedIn(d.key)) { districtSaturated[d.key] = true; break; }
        }
        if (districtSaturated[d.key] || budgetHit) break;
      }
      if (budgetHit) break;
    }
    } catch (e) {
      if (!(e instanceof QuotaExhausted)) throw e;
      // Daily quota hit mid-district. Everything paid for so far is already in
      // CENSUS; checkpoint it and stop cleanly instead of losing the run.
      quotaStopped = true;
      console.log(`  ${d.key.padEnd(16)} QUOTA EXHAUSTED mid-district — checkpointing ${CENSUS.size} place_ids`);
    }
    if (districtSaturated[d.key] === undefined) districtSaturated[d.key] = false;
    districtCalls[d.key] = priced().total - before;
    console.log(`  ${d.key.padEnd(16)} ${districtSaturated[d.key] ? "SATURATED" : "not saturated"}  (+${districtCalls[d.key]} calls, census ${CENSUS.size})`);
    saveCheckpoint(slug, districtSaturated, districtCalls); // <- after EVERY district
    if (budgetHit || quotaStopped) break;
  }
  const stoppedEarly = city.districts.every((d) => districtSaturated[d.key]);

  // Geo tag. Nothing dropped for exceeding metroMi — only contamination.
  for (const rec of CENSUS.values()) {
    rec.distMi = (rec.lat != null && rec.lng != null) ? distMi(city, { lat: rec.lat, lng: rec.lng }) : null;
    rec.inMetro = rec.distMi != null ? rec.distMi <= city.metroMi : null;
  }
  const contaminated = [...CENSUS.values()].filter((v) => v.distMi != null && v.distMi > CONTAMINATION_MI);
  for (const v of contaminated) CENSUS.delete(v.place_id);

  const rows = [...CENSUS.values()];
  if (!rows.length) { console.error("FATAL: empty census — nothing to report"); process.exit(1); }
  if (!rows.some((r) => r.distMi != null)) { console.error("FATAL: zero rows carry coordinates — geo probe broken"); process.exit(1); }

  const byStrategy = (s) => new Set(rows.filter((r) => r.foundBy.has(s)).map((r) => r.place_id));
  const SA = byStrategy("A"), SB = byStrategy("B"), SC = byStrategy("C");
  const only = (x, ...rest) => [...x].filter((i) => !rest.some((o) => o.has(i))).length;

  // Saturation curve, bucketed, so the collapse is visible rather than asserted.
  const BUCKET = 20, buckets = [];
  for (let i = 0; i < CURVE.length; i += BUCKET) {
    const w = CURVE.slice(i, i + BUCKET);
    buckets.push({ from: i, to: i + w.length, fresh: w.reduce((a, x) => a + x.fresh, 0), returned: w.reduce((a, x) => a + x.returned, 0) });
  }

  console.log(`\n═══ CENSUS ${slug} ═══`);
  console.log(`  place_ids            : ${rows.length}   (in-metro ${rows.filter((r) => r.inMetro).length}, out-of-metro TAGGED ${rows.filter((r) => r.inMetro === false).length}, contamination dropped ${contaminated.length})`);
  console.log(`  UNCATEGORISED        : ${rows.filter((r) => r.category === null).length}  <- Rule 2: countable state, classified in a separate free pass`);
  console.log(`  classification inputs: types[] on ${rows.filter((r) => r.types.length).length}, primaryType on ${rows.filter((r) => r.primaryType).length}, hours on ${rows.filter((r) => r.hours).length}`);
  console.log(`\n  strategy contribution (symmetric difference — no strategy is a superset):`);
  console.log(`    A taxonomy ${SA.size}   only-A ${only(SA, SB, SC)}`);
  console.log(`    B language ${SB.size}   only-B ${only(SB, SA, SC)}`);
  console.log(`    C landmark ${SC.size}   only-C ${only(SC, SA, SB)}`);
  console.log(`\n  SATURATION CURVE (new place_ids per ${BUCKET}-query bucket):`);
  for (const b of buckets) console.log(`    q${String(b.from).padStart(3)}-${String(b.to).padStart(3)}  fresh ${String(b.fresh).padStart(4)} / ${String(b.returned).padStart(4)} returned   ${(100 * b.fresh / (b.returned || 1)).toFixed(1)}%`);
  const last = buckets[buckets.length - 1];
  console.log(`\n  marginal yield in final bucket: ${(100 * last.fresh / (last.returned || 1)).toFixed(1)}%  (saturation threshold ${(100 * SATURATION_YIELD).toFixed(0)}%)`);

  console.log(`\n  districts individually saturated: ${Object.entries(districtSaturated).filter(([, v]) => v).map(([k]) => k).join(", ") || "NONE"}`);
  console.log(`  METRO SATURATED: ${stoppedEarly ? "yes" : "NO — exit criterion NOT met"}`);
  if (quotaStopped) console.log(`  *** DAILY QUOTA EXHAUSTED — sweep INCOMPLETE. Checkpoint saved; resume with --resume once quota resets. Figures below are a FLOOR. ***`);
  if (budgetHit) console.log(`  *** CALL BUDGET ${MAX_CALLS} BOUND — the sweep was TRUNCATED, not completed. Coverage below is a floor. ***`);
  const p = priced();
  console.log(`\n  cost: ${p.total} calls = $${p.usd}`);

  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  writeFileSync(join(ROOT, "tmp", `census-${slug}.json`), JSON.stringify({
    city: slug, builtAt: null,
    counts: { total: rows.length, inMetro: rows.filter((r) => r.inMetro).length, outOfMetroTagged: rows.filter((r) => r.inMetro === false).length, contaminationDropped: contaminated.length, uncategorised: rows.filter((r) => r.category === null).length },
    strategies: { a: SA.size, b: SB.size, c: SC.size, onlyA: only(SA, SB, SC), onlyB: only(SB, SA, SC), onlyC: only(SC, SA, SB) },
    calls: p, saturation: { buckets, curve: CURVE, districtSaturated, districtCalls, budgetHit, maxCalls: MAX_CALLS, window: SATURATION_WINDOW, threshold: SATURATION_YIELD, stoppedEarly },
    rows: rows.map((r) => ({ ...r, foundBy: [...r.foundBy].sort() })),
  }, null, 2));
  console.log(`  census -> tmp/census-${slug}.json`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });

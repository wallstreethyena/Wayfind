// scripts/census-sweep.mjs — PHASE 0 instrument validation.
//
// Purpose: prove that a single retrieval strategy is NOT a trustworthy yardstick
// before any coverage number is built on one. LLAMA's 12-centre type-based sweep
// missed Tom's Watch Bar (6,738 reviews) — the 2nd-highest-volume nightlife venue
// in the investigation — which surfaced only because the live page rendered it.
//
// So: run two STRUCTURALLY different strategies over the same city x category and
// report the symmetric difference. The axis of difference is deliberate —
//
//   A) TAXONOMY-driven : searchNearby + includedTypes. Enumerates by Google's type
//      tree. Hard cap 20 results/call, NO pagination. Blind to venues Google
//      primary-types as restaurants (House of Blues -> american_restaurant).
//
//   B) LANGUAGE-driven : searchText + varied phrasings, paged to exhaustion.
//      Relevance-ranked against a phrase, ~60-result ceiling per query. Blind to
//      venues whose name/description doesn't match any phrasing we thought of.
//
// Neither is a superset of the other. That is the finding this script exists to
// make measurable rather than asserted.
//
// Cost: every call carries rating+userRatingCount => Enterprise SKU tier
// ($35/1k for both Text Search Enterprise and Nearby Search Enterprise).
// The script COUNTS its own calls and prints the priced total. Read it.
//
// Usage: node scripts/census-sweep.mjs [--dry]
//   --dry  plan and price the sweep, make zero API calls.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { placeAllowed } from "../lib/placeFilter.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

// ── env ───────────────────────────────────────────────────────────────────
function loadKey() {
  if (process.env.GOOGLE_MAPS_SERVER_KEY) return process.env.GOOGLE_MAPS_SERVER_KEY;
  try {
    const txt = readFileSync(join(ROOT, ".env.local"), "utf8");
    const m = txt.match(/^GOOGLE_MAPS_SERVER_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {}
  return null;
}

// ── the nightlife predicate, COPIED from lib/nightlifeRail.js on the #412
// branch (feat/orlando-nightlife). Copied, not imported: #412 is unmerged and
// this instrument must not depend on an open branch. If #412 lands, replace
// this block with an import and delete the duplication.
const VENUE_TYPES = ["night_club", "live_music_venue", "concert_hall", "comedy_club",
  "dance_hall", "dive_bar", "hookah_bar", "karaoke"];
const BAR_PRIMARY_TYPES = ["bar", "cocktail_bar", "wine_bar", "sports_bar", "pub",
  "irish_pub", "brewery", "brewpub", "beer_garden", "gastropub", "lounge_bar"];
function isNightlifeVenue(p) {
  if (!p) return false;
  const types = Array.isArray(p.types) ? p.types : [];
  if (types.some((t) => VENUE_TYPES.includes(t))) return true;
  return BAR_PRIMARY_TYPES.includes(p.primaryType);
}

// ── per-metro district centres ────────────────────────────────────────────
// NOT a uniform grid and NOT the city centroid. lib/landing.js:171 rankedFor()
// runs ONE text query from the centroid at 27,359m. Phase 0 proved that shape
// cannot reach Orlando's highest-volume nightlife: Twin Peaks is reachable only
// from the I-Drive centre, Tom's Watch Bar only from CityWalk/I-Drive.
//
// metroMi is the in-metro TAG radius, Orlando-calibrated at 35. It is NOT
// global — see SPEC-per-metro-radius below. Nothing is dropped for exceeding
// it; rows are TAGGED. Only CONTAMINATION_MI is a hard drop.
//
// SPEC-per-metro-radius (Phase 3): derive metroMi per city rather than choose
// it — e.g. the radius containing the 90th percentile of that metro's own
// candidate distance distribution, floored at ~10mi and capped at ~50mi. A
// constant tuned on Orlando is too tight for a sprawling metro and absurd for
// a small one, exactly as RAIL_MIN_REVIEWS is Orlando-calibrated (#412).
const CONTAMINATION_MI = 150; // implausible at ANY distance -> hard drop
const CITIES = {
  orlando: { lat: 28.5384, lng: -81.3789, metroMi: 35, districts: [
    { key: "disney-springs", lat: 28.3705, lng: -81.5194, radius: 2000 },
    { key: "citywalk",       lat: 28.4726, lng: -81.4694, radius: 2000 },
    { key: "i-drive",        lat: 28.4432, lng: -81.4682, radius: 3000 },
    { key: "downtown",       lat: 28.5421, lng: -81.3790, radius: 2000 },
    { key: "mills-50",       lat: 28.5560, lng: -81.3620, radius: 2000 },
    { key: "winter-park",    lat: 28.5999, lng: -81.3517, radius: 2500 },
  ]},
  honolulu: { lat: 21.3069, lng: -157.8583, metroMi: 20, districts: [
    { key: "waikiki",     lat: 21.2793, lng: -157.8294, radius: 2000 },
    { key: "downtown",    lat: 21.3114, lng: -157.8636, radius: 1500 },
    { key: "kakaako",     lat: 21.2950, lng: -157.8580, radius: 1500 },
    { key: "ala-moana",   lat: 21.2911, lng: -157.8434, radius: 1500 },
    { key: "kaimuki",     lat: 21.2820, lng: -157.8130, radius: 2000 },
    { key: "manoa",       lat: 21.3100, lng: -157.8100, radius: 2000 },
  ]},
  tampa: { lat: 27.9506, lng: -82.4572, metroMi: 30, districts: [
    { key: "ybor-city",   lat: 27.9606, lng: -82.4370, radius: 1500 },
    { key: "downtown",    lat: 27.9506, lng: -82.4572, radius: 1500 },
    { key: "hyde-park",   lat: 27.9370, lng: -82.4820, radius: 2000 },
    { key: "channelside", lat: 27.9420, lng: -82.4470, radius: 1500 },
    { key: "seminole-hts",lat: 28.0100, lng: -82.4600, radius: 2000 },
    { key: "westshore",   lat: 27.9580, lng: -82.5250, radius: 2500 },
  ]},
  venice: { lat: 27.0998, lng: -82.4543, metroMi: 15, districts: [
    { key: "downtown",    lat: 27.0998, lng: -82.4543, radius: 2000 },
    { key: "venice-isle", lat: 27.0980, lng: -82.4620, radius: 2000 },
    { key: "nokomis",     lat: 27.1200, lng: -82.4450, radius: 2500 },
    { key: "jacaranda",   lat: 27.0800, lng: -82.4100, radius: 3000 },
  ]},
};

// ── per-category retrieval config ─────────────────────────────────────────
// `dive_bar` is DELIBERATELY ABSENT from the nightlife groups while remaining in
// the predicate. Places rejects it: `400 Unsupported types: dive_bar` — it is
// not in Table A, so it cannot be an includedTypes filter. A venue whose ONLY
// nightlife signal is dive_bar is structurally unreachable by strategy A. Filed
// as issue #416 against #412.
const CATS = {
  nightlife: {
    typeGroups: [
      ["night_club", "live_music_venue", "concert_hall", "comedy_club", "dance_hall", "karaoke"],
      ["bar", "cocktail_bar", "lounge_bar", "hookah_bar"],
      ["pub", "irish_pub", "brewery", "brewpub", "beer_garden", "gastropub", "sports_bar", "wine_bar"],
    ],
    phrasings: ["best bars and nightlife", "live music venue", "night club", "brewery and taproom", "comedy club and entertainment"],
  },
  restaurants: {
    typeGroups: [
      ["restaurant", "fine_dining_restaurant", "steak_house", "seafood_restaurant"],
      ["italian_restaurant", "mexican_restaurant", "japanese_restaurant", "sushi_restaurant", "chinese_restaurant", "thai_restaurant"],
      ["american_restaurant", "breakfast_restaurant", "brunch_restaurant", "pizza_restaurant", "cafe", "bakery"],
    ],
    phrasings: ["best restaurants", "fine dining", "where to eat dinner", "brunch and breakfast", "seafood restaurant"],
  },
};

const FIELDS_NEARBY = "places.id,places.displayName,places.primaryType,places.types,places.rating,places.userRatingCount,places.location,places.businessStatus";
const FIELDS_TEXT = FIELDS_NEARBY + ",nextPageToken";
const MAX_PAGES = 3; // searchText ceiling is ~60 results = 3 pages of 20

let CALLS = { nearby: 0, text: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body, fieldMask, key) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function absorb(into, places, strategy, provenance) {
  let fresh = 0;
  for (const p of places || []) {
    if (!p || !p.id) continue;
    if (!into.has(p.id)) {
      into.set(p.id, {
        id: p.id,
        name: (p.displayName && p.displayName.text) || null,
        primaryType: p.primaryType || null,
        types: p.types || [],
        rating: typeof p.rating === "number" ? p.rating : null,
        reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
        // Stored because strategy B uses locationBias (SOFT) while A uses
        // locationRestriction (HARD) — without coordinates there is no way to
        // tell a genuine A/B difference from out-of-metro contamination.
        lat: p.location ? p.location.latitude : null,
        lng: p.location ? p.location.longitude : null,
        businessStatus: p.businessStatus || null,
        distMi: null, inMetro: null,
        foundBy: new Set(),
        provenance: [],
      });
      fresh++;
    }
    const rec = into.get(p.id);
    rec.foundBy.add(strategy);
    rec.provenance.push(provenance);
  }
  return fresh;
}

// ── Strategy A — taxonomy-driven ──────────────────────────────────────────
async function strategyA(key, curve, city, cat) {
  const found = new Map();
  for (const d of city.districts) {
    for (let gi = 0; gi < cat.typeGroups.length; gi++) {
      const body = {
        includedTypes: cat.typeGroups[gi],
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        locationRestriction: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: d.radius } },
      };
      const prov = `A:${d.key}:g${gi}`;
      const data = await post("https://places.googleapis.com/v1/places:searchNearby", body, FIELDS_NEARBY, key);
      CALLS.nearby++;
      const fresh = absorb(found, data.places, "A", prov);
      curve.push({ strategy: "A", query: prov, returned: (data.places || []).length, fresh, cumulative: found.size });
      await sleep(120);
    }
  }
  return found;
}

// ── Strategy B — language-driven ──────────────────────────────────────────
async function strategyB(key, curve, city, cat) {
  const found = new Map();
  for (const d of city.districts) {
    for (const phrase of cat.phrasings) {
      let pageToken = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = {
          textQuery: phrase,
          pageSize: 20,
          locationBias: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: d.radius } },
          ...(pageToken ? { pageToken } : {}),
        };
        const prov = `B:${d.key}:${phrase.slice(0, 14)}:p${page}`;
        const data = await post("https://places.googleapis.com/v1/places:searchText", body, FIELDS_TEXT, key);
        CALLS.text++;
        const fresh = absorb(found, data.places, "B", prov);
        curve.push({ strategy: "B", query: prov, returned: (data.places || []).length, fresh, cumulative: found.size });
        pageToken = data.nextPageToken || null;
        await sleep(120);
        if (!pageToken) break;
      }
    }
  }
  return found;
}

// ── geo ──────────────────────────────────────────────────────────────────
function distMi(a, b) {
  const R = 3958.8, r = (x) => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s2 = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s2));
}
// Name normalisation for rendered-vs-candidate matching. Rendered names come
// from the live page; candidate names from Places. Both are Google-sourced but
// punctuation and suffixes drift ("Fete" vs "Fête", "Tom's Watch Bar- Sky Bar").
const nn = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
function renderedMatches(renderedName, candName) {
  const a = nn(renderedName), b = nn(candName);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 8 && b.length >= 8 && (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a));
}

function priced() {
  const total = CALLS.nearby + CALLS.text;
  return { ...CALLS, total, usd: (total * 0.035).toFixed(2) };
}

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const citySlug = arg("city", "orlando"), catSlug = arg("cat", "nightlife");
  const city = CITIES[citySlug], cat = CATS[catSlug];
  if (!city || !cat) { console.error(`unknown --city ${citySlug} / --cat ${catSlug}`); process.exit(1); }

  const plannedA = city.districts.length * cat.typeGroups.length;
  const plannedBmax = city.districts.length * cat.phrasings.length * MAX_PAGES;
  console.log(`CELL  ${citySlug} x ${catSlug}   (${city.districts.length} districts, metroMi=${city.metroMi})`);
  console.log(`PLAN  A ${plannedA} searchNearby + B up to ${plannedBmax} searchText = worst case $${((plannedA + plannedBmax) * 0.035).toFixed(2)}`);
  if (DRY) { console.log("--dry: no API calls made."); return; }

  const key = loadKey();
  if (!key) { console.error("FATAL: no GOOGLE_MAPS_SERVER_KEY"); process.exit(1); }

  const curve = [];
  const A = await strategyA(key, curve, city, cat);
  const B = await strategyB(key, curve, city, cat);
  if (A.size === 0 || B.size === 0) {
    console.error(`FATAL: a strategy returned nothing (A=${A.size} B=${B.size}). No diff is meaningful.`);
    process.exit(1);
  }

  // Union, then TAG distance. Per Decision 1: nothing is deleted for being
  // outside metroMi — a 93mi regional venue is "Worth the drive" inventory, not
  // contamination. Only CONTAMINATION_MI (implausible at ANY distance) drops.
  const union = new Map([...A, ...B]);
  for (const [id, rec] of union) {
    const a = A.get(id), b = B.get(id);
    rec.foundBy = [...new Set([...(a ? [...a.foundBy] : []), ...(b ? [...b.foundBy] : [])])].sort();
    rec.distMi = (rec.lat != null && rec.lng != null) ? distMi(city, { lat: rec.lat, lng: rec.lng }) : null;
    rec.inMetro = rec.distMi != null ? rec.distMi <= city.metroMi : null;
  }
  const contaminated = [...union.values()].filter((v) => v.distMi != null && v.distMi > CONTAMINATION_MI);
  for (const v of contaminated) union.delete(v.id);

  const kept = [...union.values()];
  const withLoc = kept.filter((v) => v.distMi != null).length;
  if (withLoc === 0) { console.error("FATAL: zero rows carry coordinates — distance probe is broken, not the data."); process.exit(1); }

  const inMetro = kept.filter((v) => v.inMetro);
  const idsA = new Set(inMetro.filter((v) => v.foundBy.includes("A")).map((v) => v.id));
  const idsB = new Set(inMetro.filter((v) => v.foundBy.includes("B")).map((v) => v.id));
  const onlyA = [...idsA].filter((i) => !idsB.has(i)), onlyB = [...idsB].filter((i) => !idsA.has(i));

  // The candidate top-20. The first version of this ranked by review volume with
  // NO gate for any category without a shipped predicate, and "stated, not
  // hidden" was treated as sufficient. It was not: the Orlando restaurants
  // top-20 came back Rainforest Cafe / STK / WALMART SUPERCENTER / McDonald's /
  // IHOP x3, the page was correct to omit all of them, and the resulting 0/20
  // was arithmetically right and meaningless. A disclosed broken instrument
  // produces the same wrong number as an undisclosed one.
  //
  // Now gated by the SHIPPED classifier (lib/placeFilter.placeAllowed) — the
  // same gate lib/landing.js rankedFor() applies — and restricted to
  // OPERATIONAL venues per #411's single closed-place predicate. A yardstick
  // that admits what the page is right to reject measures nothing.
  // NIGHTLIFE uses isNightlifeVenue() from #412, NOT placeAllowed('nightlife').
  // This is a deliberate revert. placeAllowed('nightlife') admits 54% of the
  // Orlando census including Rainforest Cafe (102,353 reviews), McDonald's and
  // IHOP; isNightlifeVenue() is the two-tier types[]/primaryType predicate that
  // rejects them. The locked Phase 1 baseline (venice 7/20, honolulu 5/20,
  // orlando 1/20) was measured with isNightlifeVenue, and reproducibility of
  // that baseline matters more than keeping both categories on one predicate.
  // Do not "unify" these back onto placeAllowed.
  const GATE = { restaurants: "food", "things-to-do": "attractions", beaches: "beach" };
  const gateCat = GATE[catSlug];
  if (catSlug !== "nightlife" && !gateCat) { console.error(`FATAL: no shipped gate for --cat ${catSlug}`); process.exit(1); }
  const operational = (p) => p.businessStatus == null || p.businessStatus === "OPERATIONAL";
  const admits = catSlug === "nightlife"
    ? (p) => isNightlifeVenue(p)
    : (p) => placeAllowed(gateCat, null, { name: p.name, primaryType: p.primaryType, types: p.types, rating: p.rating, userRatingCount: p.reviews });
  const gated = inMetro.filter((p) => operational(p) && admits(p));
  // POSITIVE CONTROL: a gate that admits everything or nothing is broken, not
  // permissive. Refuse to emit a coverage number from a degenerate yardstick.
  if (gated.length === 0 || gated.length === inMetro.length) {
    console.error(`FATAL: gate '${catSlug === "nightlife" ? "isNightlifeVenue" : gateCat}' returned ${gated.length} of ${inMetro.length} — all-or-nothing means the gate is broken, not the data.`);
    process.exit(1);
  }
  const closed = inMetro.filter((p) => !operational(p)).length;
  console.log(`  gate '${catSlug === "nightlife" ? "isNightlifeVenue (#412)" : gateCat}': ${gated.length} of ${inMetro.length} in-metro rows admitted; ${closed} non-OPERATIONAL excluded`);
  const top20 = gated.sort((x, y) => y.reviews - x.reviews).slice(0, 20);

  const renderedAll = JSON.parse(readFileSync(join(ROOT, "tmp", "rendered-cells.json"), "utf8"));
  const rendered = renderedAll.cells[`${citySlug}/${catSlug}`] || [];
  if (!rendered.length) { console.error(`FATAL: no rendered list for ${citySlug}/${catSlug}`); process.exit(1); }

  const shown = top20.filter((c) => rendered.some((r) => renderedMatches(r, c.name)));
  const missing = top20.filter((c) => !shown.includes(c));

  console.log(`\n═══ ${citySlug} × ${catSlug} ═══`);
  console.log(`  A ${idsA.size}  B ${idsB.size}  onlyA ${onlyA.length}  onlyB ${onlyB.length}  symdiff ${onlyA.length + onlyB.length}`);
  console.log(`  union ${kept.length}  in-metro ${inMetro.length}  out-of-metro(TAGGED, kept) ${kept.length - inMetro.length}  contamination(dropped) ${contaminated.length}`);
  console.log(`\n  COVERAGE: ${shown.length} of ${top20.length} genuine top-20 are rendered  (page shows ${rendered.length} venues)`);
  if (missing.length) {
    console.log(`\n  MISSING from the page (rank by reviews):`);
    for (const m of missing) console.log(`    ${String(m.reviews).padStart(6)}  ${(m.name || "").slice(0, 34).padEnd(34)} ${m.distMi.toFixed(1).padStart(5)} mi  found=${m.foundBy.join("+")}`);
  }
  const p = priced();
  console.log(`\n  cost: ${p.total} calls = $${p.usd}`);

  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  writeFileSync(join(ROOT, "tmp", `census-${citySlug}-${catSlug}.json`), JSON.stringify({
    cell: `${citySlug}/${catSlug}`,
    coverage: { shown: shown.length, of: top20.length, renderedCount: rendered.length },
    counts: { a: idsA.size, b: idsB.size, onlyA: onlyA.length, onlyB: onlyB.length, union: kept.length, inMetro: inMetro.length, outOfMetroTagged: kept.length - inMetro.length, contaminationDropped: contaminated.length },
    calls: p, top20, missing, curve,
  }, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });

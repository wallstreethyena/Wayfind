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

// ── Orlando districts. NOT a uniform grid and NOT the landing centre.
// lib/landing.js puts "orlando" at 28.5384,-81.3789 (downtown). Disney Springs
// is ~15mi SW of that and CityWalk ~9mi SW — the highest-volume nightlife in the
// metro sits outside a downtown-anchored radius entirely. That is the whole
// point of anchoring on districts rather than a city centroid.
const DISTRICTS = [
  { key: "disney-springs", lat: 28.3705, lng: -81.5194, radius: 2000 },
  { key: "citywalk",       lat: 28.4726, lng: -81.4694, radius: 2000 },
  { key: "i-drive",        lat: 28.4432, lng: -81.4682, radius: 3000 },
  { key: "downtown",       lat: 28.5421, lng: -81.3790, radius: 2000 },
  { key: "mills-50",       lat: 28.5560, lng: -81.3620, radius: 2000 },
  { key: "winter-park",    lat: 28.5999, lng: -81.3517, radius: 2500 },
];

// Strategy A: three type groups so each gets its own 20-result budget per
// district. One call with all 19 types would still return only 20 rows total —
// splitting is what buys coverage under a hard, unpaginated cap.
//
// `dive_bar` is DELIBERATELY ABSENT here while remaining in the predicate above.
// Places rejects it: `400 Unsupported types: dive_bar`. It exists in a place's
// returned types[] but is not in Table A, so it cannot be used as an
// includedTypes filter. Consequence, and it is a Phase 0 finding in its own
// right: a venue whose ONLY nightlife signal is `dive_bar` is structurally
// unreachable by strategy A no matter how many centres it sweeps. Strategy B is
// the only way such a venue can enter the union.
const TYPE_GROUPS = [
  ["night_club", "live_music_venue", "concert_hall", "comedy_club", "dance_hall", "karaoke"],
  ["bar", "cocktail_bar", "lounge_bar", "hookah_bar"],
  ["pub", "irish_pub", "brewery", "brewpub", "beer_garden", "gastropub", "sports_bar", "wine_bar"],
];

// Strategy B: phrasings chosen to vary the LANGUAGE axis, not the type axis.
const PHRASINGS = [
  "best bars and nightlife",
  "live music venue",
  "night club",
  "brewery and taproom",
  "comedy club and entertainment",
];

const FIELDS_NEARBY = "places.id,places.displayName,places.primaryType,places.types,places.rating,places.userRatingCount,places.location";
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
async function strategyA(key, curve) {
  const found = new Map();
  for (const d of DISTRICTS) {
    for (let gi = 0; gi < TYPE_GROUPS.length; gi++) {
      const body = {
        includedTypes: TYPE_GROUPS[gi],
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
async function strategyB(key, curve) {
  const found = new Map();
  for (const d of DISTRICTS) {
    for (const phrase of PHRASINGS) {
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

// ── the venues Phase 0 exists to explain ──────────────────────────────────
const KNOWN_MISSING = [
  ["Twin Peaks", 13009], ["House of Blues", 7546], ["Tom's Watch Bar", 6738],
  ["Ole Red", 5927], ["Edison", 5271], ["Tin Roof", 4563], ["ICEBAR", 2918],
  ["Howl at the Moon", 2739], ["Wall Street Plaza", 2478], ["SAK Comedy", 1746],
];

function priced() {
  const total = CALLS.nearby + CALLS.text;
  return { ...CALLS, total, usd: (total * 0.035).toFixed(2) };
}

async function main() {
  const plannedA = DISTRICTS.length * TYPE_GROUPS.length;
  const plannedBmax = DISTRICTS.length * PHRASINGS.length * MAX_PAGES;
  console.log(`PLAN  strategy A (taxonomy): ${plannedA} searchNearby calls`);
  console.log(`PLAN  strategy B (language): up to ${plannedBmax} searchText calls`);
  console.log(`PLAN  worst case ${plannedA + plannedBmax} calls @ $0.035 (Enterprise) = $${((plannedA + plannedBmax) * 0.035).toFixed(2)}\n`);
  if (DRY) { console.log("--dry: no API calls made."); return; }

  const key = loadKey();
  if (!key) { console.error("FATAL: no GOOGLE_MAPS_SERVER_KEY (env or .env.local)"); process.exit(1); }

  const curve = [];
  const A = await strategyA(key, curve);
  const B = await strategyB(key, curve);

  // ASSERT THE PROBE RAN. Two empty sets compare equal; that is absence, not
  // agreement. Refuse to report a diff either side failed to produce.
  if (A.size === 0 || B.size === 0) {
    console.error(`FATAL: a strategy returned nothing (A=${A.size} B=${B.size}). No diff is meaningful.`);
    process.exit(1);
  }

  const idsA = new Set(A.keys()), idsB = new Set(B.keys());
  const onlyA = [...idsA].filter((i) => !idsB.has(i));
  const onlyB = [...idsB].filter((i) => !idsA.has(i));
  const both = [...idsA].filter((i) => idsB.has(i));

  const union = new Map([...A, ...B]);
  for (const [id, rec] of union) { const a = A.get(id), b = B.get(id); rec.foundBy = new Set([...(a?.foundBy || []), ...(b?.foundBy || [])]); }
  const nightlife = [...union.values()].filter(isNightlifeVenue);

  console.log("═══ PHASE 0 — symmetric difference, Orlando × nightlife ═══\n");
  console.log(`  A (taxonomy) unique place_ids : ${idsA.size}`);
  console.log(`  B (language) unique place_ids : ${idsB.size}`);
  console.log(`  in BOTH                       : ${both.length}`);
  console.log(`  ONLY A (B missed these)       : ${onlyA.length}`);
  console.log(`  ONLY B (A missed these)       : ${onlyB.length}`);
  console.log(`  symmetric difference          : ${onlyA.length + onlyB.length}`);
  console.log(`  union                         : ${union.size}   (nightlife-predicate: ${nightlife.length})\n`);

  const top = (ids, n) => ids.map((i) => union.get(i)).sort((x, y) => y.reviews - x.reviews).slice(0, n);
  console.log("  Highest-volume venues ONLY strategy A found (language sweep blind to these):");
  for (const v of top(onlyA, 8)) console.log(`    ${String(v.reviews).padStart(6)}  ${v.name}  [primaryType=${v.primaryType}]`);
  console.log("\n  Highest-volume venues ONLY strategy B found (taxonomy sweep blind to these):");
  for (const v of top(onlyB, 8)) console.log(`    ${String(v.reviews).padStart(6)}  ${v.name}  [primaryType=${v.primaryType}]`);

  console.log("\n═══ the ten venues that are missing from the live page ═══");
  for (const [needle, vol] of KNOWN_MISSING) {
    const hit = [...union.values()].find((v) => v.name && v.name.toLowerCase().includes(needle.toLowerCase()));
    const by = hit ? [...hit.foundBy].sort().join("+") : "—";
    const pred = hit ? (isNightlifeVenue(hit) ? "passes" : "FAILS predicate") : "—";
    console.log(`  ${String(vol).padStart(6)}  ${needle.padEnd(20)} ${hit ? `FOUND by ${by.padEnd(4)} primaryType=${String(hit.primaryType).padEnd(22)} ${pred}` : "NOT FOUND by either strategy"}`);
  }

  const p = priced();
  console.log(`\n═══ cost ═══\n  searchNearby ${p.nearby} + searchText ${p.text} = ${p.total} calls @ $0.035 = $${p.usd}`);

  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  const out = join(ROOT, "tmp", "census-phase0.json");
  writeFileSync(out, JSON.stringify({
    generatedFor: "orlando/nightlife",
    counts: { a: idsA.size, b: idsB.size, both: both.length, onlyA: onlyA.length, onlyB: onlyB.length, union: union.size, nightlife: nightlife.length },
    calls: p,
    curve,
    places: [...union.values()].map((v) => ({ ...v, foundBy: [...v.foundBy].sort() })),
  }, null, 2));
  console.log(`  raw -> ${out}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });

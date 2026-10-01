#!/usr/bin/env node
// test-evergreen-eligibility — the evergreen landing publication policy, at its
// boundaries, through the REAL code (lib/landing.js + lib/landingPage.js
// compiled by scripts/lib/jsxLoad.mjs; fixture inventory, no network).
//
// Owner policy (2026-10-01): publish a cat × town only when >= 8 DISTINCT
// eligible places survive the real category, identity, geographic (17 mi
// straight-line from the town's downtown point) and serving filters AND the
// render path's containment grouping. Exactly 8 passes; places in neighboring
// towns count, because every surface says "in and near". Below 8 -> 404.
// A configured inventory read that ERRORS must throw (ISR keeps the last good
// page) instead of looking like an empty market and 404ing a good page.
//
// Covers: 7/8/9 distinct; duplicate ids and duplicate names; containment
// nesting; 16.9 / 17.0 / 17.1 mi; missing and NaN coordinates; a wrong-category
// row; failLoud vs empty; the LANDING_CITIES control (no floor, copy unchanged);
// the "in and near" copy on title / H1 / description / visible note / ItemList;
// no link to a withheld pair from any published page; the inbound links
// (same-category row on LANDING_CITIES pages, guide links by exact town name);
// the intentional no-photo tile.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };

const SB = "https://sb.evergreen-eligibility.invalid";
for (const k of ["WAYFIND_GATE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "GOOGLE_MAPS_SERVER_KEY", "VERCEL_ENV", "NEXT_PHASE", "INSIDER_ENABLED"]) delete process.env[k];
Object.assign(process.env, { WAYFIND_GATE: "shut", SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "k", NEXT_PUBLIC_SUPABASE_URL: SB, NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", VERCEL_ENV: "production" });
let google = 0;
globalThis.fetch = async (u) => {
  if (/googleapis\.com/.test(String(u))) google++;
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};

const landing = await loadComponent(path.join(ROOT, "lib/landing.js"), ROOT);
const page = await loadComponent(path.join(ROOT, "lib/landingPage.js"), ROOT);
const card = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const ev = await import("../lib/evergreenCities.js");
const { LANDING_CITIES } = await import("../lib/landingCities.js");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");

const MI_PER_DEG_LAT = 3958.8 * Math.PI / 180; // haversine's own radius, so offsets land where intended
const TYPES = {
  "things-to-do": { types: ["museum", "tourist_attraction", "point_of_interest"], primaryType: "museum", category: "attractions" },
  restaurants: { types: ["restaurant", "food", "point_of_interest"], primaryType: "restaurant", category: "food" },
};
let seq = 0;
const row = (cat, city, i, extra = {}) => {
  const id = ("ChIJElig" + String(seq++).padStart(5, "0") + "Q" + String(i).padStart(3, "0")).padEnd(27, "x");
  return {
    place_id: id, id, name: `Eligible ${cat} ${i}`, rating: 4.3 + (i % 5) / 10, userRatingCount: 400 + i * 37,
    formattedAddress: `${i + 1} Main St, ${city.name}, FL`, businessStatus: "OPERATIONAL",
    // ~0.2 mi apart along a line: well clear of the 800 m containment radius
    location: { latitude: city.lat + (i * 0.2) / MI_PER_DEG_LAT, longitude: city.lng },
    photoRef: null, ...TYPES[cat], ...extra,
  };
};
const rows = (cat, city, n) => Array.from({ length: n }, (_, i) => row(cat, city, i));
const atMiles = (cat, city, i, mi) => row(cat, city, i, { location: { latitude: city.lat + mi / MI_PER_DEG_LAT, longitude: city.lng } });
const NAP = ev.EVERGREEN_CITIES.naples;
const isNotFound = (e) => !!e && (/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(e.digest || "")) || /NEXT_NOT_FOUND/.test(String(e.message || "")));
async function renderPair(cat, slug, inventoryRows) {
  try {
    const el = await page.LandingPage({ catSlug: cat, citySlug: slug, rankOpts: { inventoryRows } });
    return { html: renderToStaticMarkup(el), notFound: false, error: null };
  } catch (e) { return { html: "", notFound: isNotFound(e), error: e }; }
}
const cardsIn = (html) => (html.match(/class="wf-place-card-rank"/g) || []).length;

// ── 1. Counting: what the page renders, distinct ─────────────────────────────
{
  const pair = landing.landingPair("things-to-do", "naples");
  const ranked = async (inv) => landing.landingRanked("things-to-do", "naples", { inventoryRows: inv });
  for (const [n, want] of [[7, false], [8, true], [9, true]]) {
    const list = await ranked(rows("things-to-do", NAP, n));
    const e = landing.landingEligibility(pair, list);
    ok(e.count === n && e.eligible === want, `${n} distinct eligible places -> count ${e.count}, eligible ${e.eligible} (want ${n}, ${want})`);
  }
  const base = rows("things-to-do", NAP, 8);
  const dupId = await ranked([...base.slice(0, 7), { ...base[6] }]);
  ok(landing.landingEligibility(pair, dupId).count === 7, `8 rows where 2 share a place id count as 7 (got ${landing.landingEligibility(pair, dupId).count})`);
  const dupName = await ranked([...base.slice(0, 7), { ...row("things-to-do", NAP, 30), name: base[2].name }]);
  ok(landing.landingEligibility(pair, dupName).count === 7, `8 rows where 2 share a name (different ids) count as 7 (got ${landing.landingEligibility(pair, dupName).count})`);
  const groups = landing.landingRenderedGroups(await ranked(base)).groups;
  ok(groups.length === 8 && landing.distinctRenderedCount(groups) === 8, "landingRenderedGroups is what the count reads (8 groups -> 8)");
}

// ── 2. Geography: 17 mi straight-line from the reference point ──────────────
{
  const inside = rows("things-to-do", NAP, 7);
  const list = await landing.landingRanked("things-to-do", "naples", { inventoryRows: [...inside, atMiles("things-to-do", NAP, 40, 16.9), atMiles("things-to-do", NAP, 41, 17.0), atMiles("things-to-do", NAP, 42, 17.1)] });
  const names = new Set(list.map((p) => p.name));
  ok(names.has("Eligible things-to-do 40") && names.has("Eligible things-to-do 41"), "16.9 mi and 17.0 mi (on the limit) are kept");
  ok(!names.has("Eligible things-to-do 42"), "17.1 mi is dropped");
  ok(Math.abs(landing.EVERGREEN_MAX_MI - ev.EVERGREEN_RADIUS_MI) < 0.01, `the clamp (${landing.EVERGREEN_MAX_MI.toFixed(4)} mi) is the disclosed radius (${ev.EVERGREEN_RADIUS_MI} mi)`);
  const noGeo = await landing.landingRanked("things-to-do", "naples", { inventoryRows: [...rows("things-to-do", NAP, 7),
    row("things-to-do", NAP, 50, { location: null }), row("things-to-do", NAP, 51, { location: { latitude: NaN, longitude: NaN } })] });
  ok(noGeo.length === 7 && landing.landingEligibility(landing.landingPair("things-to-do", "naples"), noGeo).count === 7,
    `rows with missing or NaN coordinates cannot be shown within the radius, so they do not count (ranked ${noGeo.length})`);
  const ctl = await landing.rankedFor("things-to-do", "sarasota", { inventoryRows: [atMiles("things-to-do", LANDING_CITIES.sarasota, 60, 18.5)], inventoryOnly: true });
  ok(Array.isArray(ctl) && ctl.some((p) => p.name === "Eligible things-to-do 60"), "CONTROL: LANDING_CITIES ranking is unchanged (no evergreen clamp)");
}

// ── 3. Category: a row of the wrong kind does not count ─────────────────────
{
  const hotel = row("things-to-do", NAP, 70, { name: "Harborview Hotel", types: ["lodging", "hotel", "point_of_interest"], primaryType: "hotel", category: "hotels" });
  const list = await landing.landingRanked("things-to-do", "naples", { inventoryRows: [...rows("things-to-do", NAP, 7), hotel] });
  ok(!list.some((p) => p.name === "Harborview Hotel"), "a hotel row on a things-to-do page is filtered before ranking");
  ok(landing.landingEligibility(landing.landingPair("things-to-do", "naples"), list).count === 7, "so 7 attractions + 1 hotel is below the floor");
}

// ── 4. The page: 404 below the floor, renders at it, throws on a read error ──
{
  const at7 = await renderPair("things-to-do", "naples", rows("things-to-do", NAP, 7));
  ok(at7.notFound, `7 distinct -> LandingPage calls notFound() (got ${at7.error ? at7.error.message : "a rendered page"})`);
  const at8 = await renderPair("things-to-do", "naples", rows("things-to-do", NAP, 8));
  ok(!at8.error && cardsIn(at8.html) === 8, `exactly 8 distinct -> the page renders 8 cards (got ${cardsIn(at8.html)}${at8.error ? ", error " + at8.error.message : ""})`);
  let threw = null;
  try { await page.LandingPage({ catSlug: "things-to-do", citySlug: "naples", rankOpts: { serveFromInventory: async (cat, lat, lng, r, n, sub, o) => { if (o && o.failLoud) throw new Error("db down"); return []; } } }); }
  catch (e) { threw = e; }
  ok(threw && !isNotFound(threw) && /db down/.test(threw.message), `a configured inventory read that errors THROWS (keeps the last good ISR page), never 404s (got ${threw ? threw.message : "no throw"})`);
  const thinCtl = await renderPair("restaurants", "sarasota", rows("restaurants", LANDING_CITIES.sarasota, 3));
  ok(!thinCtl.error && cardsIn(thinCtl.html) === 3, "CONTROL: a LANDING_CITIES page with 3 places still renders (the floor is evergreen-only)");
}

// ── 5. Copy: every surface makes the same "in and near" claim ────────────────
{
  const { html } = await renderPair("restaurants", "naples", rows("restaurants", NAP, 9));
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
  ok(/in and near Naples, FL/.test(h1), `H1 says "in and near Naples, FL": ${h1}`);
  const note = (html.match(/<p data-landing-scope[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
  ok(/within 17 miles of downtown Naples/.test(note) && /straight line, not by road/.test(note) && /neighboring towns/.test(note) && note.includes(NAP.lat.toFixed(4)),
    `the visible scope note names the radius, the reference point and straight-line measurement: ${note}`);
  ok(html.indexOf("data-landing-scope") > -1 && html.indexOf("data-landing-scope") < html.indexOf("The ranked list"), "the note sits above the ranked list, not in the footer");
  ok(/"@type":"ItemList","name":"Best Restaurants in and near Naples, FL"/.test(html), "ItemList JSON-LD name matches the H1's scope");
  const meta = await landing.landingMetadata("restaurants", "naples");
  ok(/^Best Restaurants in and near Naples, FL \(\d{4}\) \| Real Reviews$/.test(meta.title), `<title> says in and near: ${meta.title}`);
  ok(/in and near Naples, FL/.test(meta.description) && /straight-line/.test(meta.description), `meta description says in and near + straight-line: ${meta.description}`);
  ok(!/\bdriv/i.test(note + meta.description + h1), "no surface implies driving distance");
  const sar = await renderPair("restaurants", "sarasota", rows("restaurants", LANDING_CITIES.sarasota, 9));
  const sarMeta = await landing.landingMetadata("restaurants", "sarasota");
  const sarH1 = (sar.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
  ok(/^The best restaurants in Sarasota, FL/.test(sarH1) && !sar.html.includes("data-landing-scope") && /^Best Restaurants in Sarasota, FL /.test(sarMeta.title),
    `CONTROL: LANDING_CITIES H1/title unchanged and no scope note (H1: ${sarH1})`);
}

// ── 6. Links: never to a withheld pair; inbound links exist ──────────────────
{
  const withheld = Object.entries(ev.EVERGREEN_WITHHELD).flatMap(([s, cs]) => cs.map((c) => `/${c}/${s}`));
  const published = Object.keys(landing.LANDING_CATS).flatMap((c) => ev.evergreenSlugsFor(c).map((s) => `/${c}/${s}`));
  ok(withheld.includes("/things-to-do/st-augustine") && published.length === 14, `fixture sanity: 14 published, withheld includes things-to-do/st-augustine (${withheld.length})`);
  const pages = [...published.map((p) => p.slice(1).split("/")), ["restaurants", "sarasota"], ["things-to-do", "orlando"], ["nightlife", "tampa"], ["beaches", "sarasota"]];
  for (const [c, s] of pages) {
    const city = landing.landingPair(c, s).city;
    const fixtureCat = c === "restaurants" ? "restaurants" : "things-to-do";
    const inv = rows(fixtureCat, city, 9).map((r) => ({ ...r, ...(c === "beaches" ? { types: ["beach", "natural_feature", "tourist_attraction"], primaryType: "beach", category: "beach" } : c === "nightlife" ? { types: ["bar", "night_club", "point_of_interest"], primaryType: "bar", category: "nightlife" } : {}) }));
    const r = await renderPair(c, s, inv);
    if (r.error && !r.notFound) { ok(false, `/${c}/${s} rendered without error (${r.error.message})`); continue; }
    for (const w of withheld) ok(!r.html.includes(`href="${w}"`), `/${c}/${s} never links withheld ${w}`);
    if (s === "sarasota" && c === "restaurants") {
      const want = ev.evergreenSlugsFor("restaurants").map((t) => `href="/restaurants/${t}"`);
      ok(want.length === 5 && want.every((h) => r.html.includes(h)) && /More Florida restaurants rankings/.test(r.html),
        `/restaurants/sarasota links all 5 published evergreen restaurant pages under "More Florida restaurants rankings"`);
    }
  }
  const nap = landing.evergreenLinksForTown("Naples").map((l) => l.href);
  ok(JSON.stringify(nap) === JSON.stringify(["/things-to-do/naples", "/restaurants/naples", "/nightlife/naples"]), `Naples guide links its 3 published pairs, not beaches (got ${nap.join(", ")})`);
  const sta = landing.evergreenLinksForTown("St. Augustine").map((l) => l.href);
  ok(JSON.stringify(sta) === JSON.stringify(["/restaurants/st-augustine", "/nightlife/st-augustine"]), `St. Augustine guide links only published pairs (got ${sta.join(", ")})`);
  ok(landing.evergreenLinksForTown("Sarasota").length === 0 && landing.evergreenLinksForTown("Naple").length === 0 && landing.evergreenLinksForTown("").length === 0,
    "no evergreen links for a LANDING_CITIES town, a near-miss name, or no region");
}

// ── 7. The no-photo tile is intentional on evergreen cards only ──────────────
{
  const Card = card.default;
  // No id and no photo = no photo source at all, so the server render takes
  // the monogram branch — the same branch a card reaches in the browser when
  // its nospend place photo 404s (onError -> setImgFailed).
  const base = { name: "Corkscrew Swamp Sanctuary", rating: 4.8, reviews: 3100, photo: null, cardCategory: "Things to Do" };
  const ev1 = renderToStaticMarkup(React.createElement(Card, { place: { ...base, photoNoSpend: true }, rank: 1 }));
  ok(/role="img" aria-label="Corkscrew Swamp Sanctuary: no verified photo yet"/.test(ev1) && />No verified photo yet</.test(ev1), "evergreen card with no verified photo: labelled image + visible caption");
  const plain = renderToStaticMarkup(React.createElement(Card, { place: base, rank: 1 }));
  ok(/class="wf-place-card-monogram" aria-hidden="true"/.test(plain) && !/No verified photo yet/.test(plain), "CONTROL: other surfaces keep the unchanged monogram");
}

ok(google === 0, `no Google request anywhere in this test (${google})`);
if (failures) { console.error(`test-evergreen-eligibility: FAIL (${failures}/${asserts})`); process.exit(1); }
console.log(`test-evergreen-eligibility: OK (${asserts} assertions — 7/8/9, duplicates, 16.9/17.0/17.1 mi, no-geo, wrong category, 404 vs throw, copy on 5 surfaces, links on ${14 + 4} pages, no-photo tile)`);

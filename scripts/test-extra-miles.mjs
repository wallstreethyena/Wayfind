#!/usr/bin/env node
// scripts/test-extra-miles.mjs — "Worth the Extra Miles" (Lane E) adds
// choices WITHOUT changing one card the 12–27 mile Worth the Drive rail
// would have shown.
//
// THE OWNER'S ACCEPTANCE RULES (2026-09-07), each asserted below by CALL:
//   • separate tail, own data boundary — never inside buildDrivePool or the
//     ordinary drive ranking (source both directions + behaviour)
//   • 30–180 miles only; ≤27 is the existing rail's; 28 belongs to nobody
//   • exactly the five governed owned park ids, no fuzzy / opportunistic adds
//   • every card resolves to a real existing /places/<id> page
//   • reviewed Lane A editorial only, never copy generated from a venue name
//   • THE INVARIANT: with Lane E enabled or disabled, the ordinary Worth the
//     Drive candidate set AND ORDER are byte-identical
//   • 28-mi control excluded from both bands; 30 admitted to Extra Miles;
//     >180 rejected; none of the five can appear twice
//
// buildDrivePool is loaded for real (same JSX loader the compute-budget guard
// uses) with the ranker injected and fetch set to THROW, so "unchanged" is
// measured on the actual production function, not reasoned about.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { DRIVE_MIN_MI, DRIVE_REACH_MI } from "../lib/railSelect.js";
import { DRIVE_BAND } from "../lib/worthTheDrive.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

process.env.SUPABASE_URL = "https://fixture.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
delete process.env.GOOGLE_MAPS_SERVER_KEY;

// lib/extraMiles.js imports JSON, which plain node ESM refuses without an
// import attribute; the JSX loader transpiles it the way Next does.
const xm = await loadComponent(join(ROOT, "lib/extraMiles.js"), ROOT);
const { EXTRA_MILES_PLACE_IDS, EXTRA_MILES_BAND, extraMilesFrom, extraMilesEditorial, inExtraMilesBand } = xm;
const railsMod = await loadComponent(join(ROOT, "lib/railsData.js"), ROOT);
const photoMod = await import("../lib/placePhoto.js");
const routeMod = await loadComponent(join(ROOT, "app/api/extra-miles/route.js"), ROOT);
const landingMod = await loadComponent(join(ROOT, "lib/landing.js"), ROOT);
const { buildDrivePool } = railsMod;
const LANDING_CITIES = landingMod.LANDING_CITIES;
const proof = JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/extra-miles-proof-2026-09-07.json"), "utf8"));
const pack = JSON.parse(readFileSync(join(ROOT, "docs/editorial/miami-fall-drive-2026-09-06/drive-park-editorial.json"), "utf8"));
const packById = new Map(pack.parks.map((p) => [p.id, p]));

// ── 1. The registry: exactly five, each proven, each with reviewed copy ───
{
  const ids = Object.keys(EXTRA_MILES_PLACE_IDS);
  eq(ids.length, 5, "exactly five governed park ids — no opportunistic additions");
  ok(Object.isFrozen(EXTRA_MILES_PLACE_IDS), "the registry is frozen");
  for (const id of ids) {
    const p = proof.rows[id];
    ok(!!p, `${id} is in the live-inventory proof snapshot`);
    if (!p) continue;
    ok(p.status === "OPERATIONAL" && p.excluded === false && p.has_photo === true, `${id} (${p.name}): OPERATIONAL, not excluded, owned photo`);
    ok(p.in_place_ids === true, `${id} (${p.name}): present in wf_place_ids → /places/${id} is a real page`);
    const ed = extraMilesEditorial(id);
    const src = packById.get(EXTRA_MILES_PLACE_IDS[id]);
    ok(!!ed && !!src, `${id}: editorial resolves to a reviewed Lane A pack entry (${EXTRA_MILES_PLACE_IDS[id]})`);
    if (ed && src) {
      ok(ed.hook === src.hook && ed.whyGo === src.whyGo && ed.name === src.name, `${id}: hook / whyGo / name are the pack's verbatim — not generated from the venue name`);
      ok(ed.hook.length > 20 && !/undefined|null/.test(ed.hook), `${id}: hook is real prose`);
    }
  }
  ok(Object.keys(proof.rows).every((id) => id in EXTRA_MILES_PLACE_IDS), "no proof row without a registry entry (no orphan proof)");
  eq(EXTRA_MILES_BAND, { minMi: DRIVE_BAND.nearMi, maxMi: DRIVE_BAND.farMi }, "the band IS lib/worthTheDrive.js's DRIVE_BAND (30–180), not a new constant");
  eq([EXTRA_MILES_BAND.minMi, EXTRA_MILES_BAND.maxMi], [30, 180], "…and that band is 30–180 miles");
  eq([DRIVE_MIN_MI, DRIVE_REACH_MI], [12, 27], "the ordinary drive contract is still 12–27 (Lane E moved nothing)");
  ok(EXTRA_MILES_BAND.minMi > DRIVE_REACH_MI, "the two bands cannot overlap: Extra Miles starts above the ordinary reach");
}

// ── Fixture geometry: rows at exact distances due north of a reader ───────
const ORIGIN = { lat: LANDING_CITIES.miami.lat, lng: LANDING_CITIES.miami.lng };
const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b, c, d) => R * 2 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const MI_PER_DEG = R * Math.PI / 180;
const at = (mi) => ({ lat: ORIGIN.lat + mi / MI_PER_DEG, lng: ORIGIN.lng });
const IDS = Object.keys(EXTRA_MILES_PLACE_IDS);
const park = (i, mi, extra) => ({ place_id: IDS[i], name: proof.rows[IDS[i]].name, ...at(mi), photo_ref: `places/${IDS[i]}/photos/AVoNoX-owned-${i}`, status: "OPERATIONAL", excluded: false, ...extra });
const allPages = () => true;

// ── 2. Band arithmetic, by call ───────────────────────────────────────────
{
  for (const [mi, want] of [[20, false], [27, false], [28, false], [29.99, false], [30, true], [100, true], [180, true], [180.01, false], [181, false]]) {
    eq(inExtraMilesBand(mi), want, `inExtraMilesBand(${mi}) === ${want}`);
  }
  const rows = [park(0, 28), park(1, 30), park(2, 180), park(3, 181), park(4, 20)];
  const got = extraMilesFrom(ORIGIN, rows, allPages).map((c) => [c.id, c.distMi]);
  eq(got.map((x) => x[0]), [IDS[1], IDS[2]], "28-mi control excluded, 30-mi admitted, 180 admitted, 181 rejected, 20 rejected — nearest first");
  ok(got.every(([, d]) => d >= 30 && d <= 180), "every emitted distMi sits inside 30–180");
}

// ── 3. Eligibility: real page, owned photo, operational, registered, once ─
{
  const rows = [
    park(0, 60), park(0, 60), // duplicate id
    park(1, 70, { photo_ref: null }), // no owned photo
    park(2, 80, { status: "CLOSED_PERMANENTLY" }),
    park(3, 90, { excluded: true }),
    { place_id: "ChIJnot-a-governed-park-0000000", name: "Some Springs", ...at(75), photo_ref: "x", status: "OPERATIONAL", excluded: false }, // opportunistic
    park(4, 100),
  ];
  const got = extraMilesFrom(ORIGIN, rows, (id) => id !== IDS[4]).map((c) => c.id);
  eq(got, [IDS[0]], "duplicate appears once; no-photo, closed, excluded, unregistered, and no-/places/-page rows are all rejected");
  const noPages = extraMilesFrom(ORIGIN, [park(0, 60)], () => false);
  eq(noPages, [], "a park whose /places/ page is not proven is not eligible, whatever else is true");
  const card = extraMilesFrom(ORIGIN, [park(0, 60)], allPages)[0];
  ok(card && card.href === `/places/${IDS[0]}` && card.kind === "extra-miles", "a card links to its real /places/<id> page and is typed extra-miles");
  // The image goes through the ONE owned-photo path every card uses
  // (/api/photo?ref=<owned photo_ref>), and the card law's own checker agrees
  // the picture belongs to THIS place. (`?place=<id>` 404'd on the preview.)
  ok(card && /^\/api\/photo\?ref=/.test(card.image) && photoMod.isLandingCardImageAllowed(card.image, IDS[0]),
    "the card's image is the owned photo_ref via /api/photo?ref= and passes isLandingCardImageAllowed for its own place id");
  ok(card && !photoMod.isLandingCardImageAllowed(card.image, IDS[1]), "CONTROL: the same image is NOT allowed for a different place id (no neighbour's photo can ever wear this card)");
  const noRef = extraMilesFrom(ORIGIN, [park(0, 60, { photo_ref: "" })], allPages);
  eq(noRef, [], "an empty photo_ref is 'no owned photo' → not eligible");
  ok(card && !("affiliate" in card) && !("deal" in card) && !("_s" in card), "no affiliate or score fields ride on a tail card — distance is the only order");
  const five = extraMilesFrom(ORIGIN, [park(0, 40), park(1, 50), park(2, 60), park(3, 70), park(4, 80), park(0, 40)], allPages);
  eq(five.length, 5, "five distinct parks in band → five cards, the duplicate collapsed (none of the five can appear twice)");
  eq(new Set(five.map((c) => c.id)).size, 5, "…and the five ids are distinct");
}

// ── 4. THE INVARIANT: the ordinary drive pool is identical with Lane E on/off
{
  // A Miami reader's world: ordinary drive candidates from the drive-source
  // centres PLUS the five parks at their REAL distances (Biscayne 18 mi sits
  // inside the ordinary band on purpose — Lane E must neither steal it nor
  // duplicate it).
  const real = IDS.map((id) => ({ place_id: id, id, name: proof.rows[id].name, lat: proof.rows[id].lat, lng: proof.rows[id].lng, photo_ref: "AVoNoX-owned", status: "OPERATIONAL", excluded: false, _s: 70, reviews: 500 }));
  const ordinary = [
    { id: "ftl-escape", name: "Escapology Plantation", ...at(25.5), _s: 61, reviews: 900 },
    { id: "hollywood-glass", name: "Hollywood Hot Glass", ...at(17.5), _s: 58, reviews: 400 },
    { id: "kendall-wall", name: "Off The Wall Kendall", ...at(14.9), _s: 55, reviews: 300 },
    { id: "too-near", name: "Downtown thing", ...at(5), _s: 90, reviews: 5000 },
    { id: "too-far", name: "Palm Beach thing", ...at(60), _s: 95, reviews: 9000 },
  ];
  const world = [...ordinary, ...real];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK REACHED"); };
  let calls = 0;
  const rank = async () => { calls++; return world.map((r) => ({ ...r })); };
  const runOrdinary = () => buildDrivePool({}, ORIGIN, ["miami"], null, { rank });
  try {
    const before = (await runOrdinary()).map((p) => [p.id, p.distMi]);
    // "Enable Lane E": run the tail selector over the same world.
    const tail = extraMilesFrom(ORIGIN, world, allPages);
    const after = (await runOrdinary()).map((p) => [p.id, p.distMi]);
    eq(after, before, "THE INVARIANT — ordinary Worth the Drive candidate set AND ORDER are byte-identical with Lane E enabled");
    ok(before.length > 0, "CONTROL: the ordinary pool is non-empty (the invariant is not vacuous)");
    ok(before.every(([, d]) => d >= DRIVE_MIN_MI && d <= DRIVE_REACH_MI), "ordinary pool stays inside 12–27 from the reader");
    ok(before.some(([id]) => id === "ChIJK4Wkv7jb2YgRv7LTOSIRIRI"), "CONTROL: Biscayne (18 mi from Miami) is an ORDINARY drive candidate — the existing rail's business");
    ok(!tail.some((c) => c.id === "ChIJK4Wkv7jb2YgRv7LTOSIRIRI"), "…and Lane E does NOT also show Biscayne to a Miami reader (≤27 belongs to the existing system)");
    const tailIds = new Set(tail.map((c) => c.id));
    ok(!before.some(([id]) => tailIds.has(id)), "no id appears in both the ordinary pool and the tail (disjoint by construction)");
    eq(tail.map((c) => c.id), ["ChIJM5Edegyx0IgRuF7SUFDyj5o", "ChIJx_pUcNiK2YgR4JfT3ovTKIw", "ChIJrfjUyddl14gRpyfE65Uk9ug", "ChIJxVcTIQ7i0IgRgYa6c5TNrgk"],
      "a Miami reader's tail is Coe (35), Shark Valley (36), Pennekamp (43), Bahia Honda (101) — nearest first, Biscayne absent");
    ok(!before.some(([id]) => id === "too-near" || id === "too-far"), "CONTROL: the ordinary band still rejects 5 mi and 60 mi rows");
    ok(!before.some(([id]) => ["ChIJM5Edegyx0IgRuF7SUFDyj5o", "ChIJx_pUcNiK2YgR4JfT3ovTKIw", "ChIJrfjUyddl14gRpyfE65Uk9ug", "ChIJxVcTIQ7i0IgRgYa6c5TNrgk"].includes(id)),
      "the four out-of-band parks never enter the ordinary pool (Lane E inventory is not fed into normal drive ranking)");
    // The 28-mile control belongs to nobody.
    const gap = { id: "gap-28", place_id: "ChIJgap-28-not-registered-00000", name: "Gap", ...at(28), _s: 99, reviews: 1, photo_ref: "x", status: "OPERATIONAL", excluded: false };
    const withGap = await buildDrivePool({}, ORIGIN, ["miami"], null, { rank: async () => [gap] });
    eq(withGap.map((p) => p.id), [], "28-mile control: rejected by the ordinary band (>27)");
    eq(extraMilesFrom(ORIGIN, [park(0, 28)], allPages), [], "28-mile control: rejected by Extra Miles too (<30)");
    ok(calls >= 2, "CONTROL: the ordinary pool was actually computed twice through the injected ranker");
  } finally {
    globalThis.fetch = prevFetch;
  }
}

// ── 4b. The route refuses a missing or nonsense point BEFORE any read ─────
{
  const call = (qs) => routeMod.GET(new Request(`https://fixture.local/api/extra-miles${qs}`));
  const prevFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK REACHED before validation"); };
  try {
    for (const [qs, why] of [["", "no coordinates"], ["?lat=&lng=", "empty coordinates"], ["?lat=abc&lng=-80", "non-numeric"], ["?lat=95&lng=-80", "out-of-range latitude"]]) {
      const res = await call(qs);
      ok(res.status === 400, `${why} → 400 (got ${res.status}) — Number(null) is 0, and 0,0 is not a reader`);
      ok(/no-store/.test(res.headers.get("cache-control") || ""), `${why} → no-store`);
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
}

// ── 5. The data boundary, in source, both directions, with positive controls
{
  const rails = strip(readFileSync(join(ROOT, "lib/railsData.js"), "utf8"));
  const select = strip(readFileSync(join(ROOT, "lib/railSelect.js"), "utf8"));
  const lane = strip(readFileSync(join(ROOT, "lib/extraMiles.js"), "utf8"));
  const route = strip(readFileSync(join(ROOT, "app/api/extra-miles/route.js"), "utf8"));
  const rail = strip(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
  const tailSrc = strip(readFileSync(join(ROOT, "app/components/ExtraMilesTail.js"), "utf8"));
  const imports = (src, name) => new RegExp(`from\\s+["'][^"']*${name}(\\.js)?["']`).test(src);
  // Positive controls for every absence probe below: each detector is first
  // shown to FIRE on a literal that should match, so a silent regex cannot
  // turn "never imports" into a permanently green nothing.
  ok(imports("import x from \"./extraMiles.js\"", "extraMiles"), "CONTROL: the import detector fires on an import of extraMiles");
  ok(/EXTRA_MILES|extraMilesFrom/.test("const a = extraMilesFrom(origin)"), "CONTROL: the name detector fires on a Lane E symbol");
  ok(/loadRailPlaces|railMenuData|buildDrivePool/.test("await buildDrivePool(pools)"), "CONTROL: the rails-pipeline detector fires on buildDrivePool");
  ok(/googleapis|searchText/.test("https://places.googleapis.com/v1/places:searchText"), "CONTROL: the Google-path detector fires on a Places URL");
  ok(/viator|ticketmaster|affiliate/i.test("<a href=\"/api/viator/go?x\">Book</a>"), "CONTROL: the affiliate detector fires on a Viator link");
  ok(/undefined|null/.test("Hook for undefined"), "CONTROL: the broken-copy detector fires on a templated 'undefined'");
  ok(/\/api\/rails/.test("fetch(`/api/rails?lat=1`)"), "CONTROL: the /api/rails detector fires on a rails fetch");
  ok(/<ExtraMilesTail[^>]*(places|dropList|shown)/.test("<ExtraMilesTail places={shown.places} />"), "CONTROL: the prop-leak detector fires when the tail is handed the rail's cards");
  ok(!imports(rails, "extraMiles") && !/EXTRA_MILES|extraMilesFrom/.test(rails), "lib/railsData.js (buildDrivePool) never imports or names Lane E");
  ok(!imports(select, "extraMiles") && !/EXTRA_MILES/.test(select), "lib/railSelect.js never imports or names Lane E");
  ok(!imports(lane, "railsData") && !imports(lane, "railSelect") && !imports(lane, "landing"), "lib/extraMiles.js imports nothing from the ordinary rail machinery");
  ok(imports(lane, "worthTheDrive"), "…its band comes from lib/worthTheDrive.js (the 30–180 destination class)");
  ok(!imports(route, "railsData") && !/loadRailPlaces|railMenuData|buildDrivePool/.test(route), "/api/extra-miles never touches the rails pipeline");
  ok(/from\("wf_inventory"\)/.test(route) && /getSkeleton\(/.test(route) && !/googleapis|searchText/.test(route), "the route reads owned inventory + wf_place_ids only — no Google path");
  // The image law at serve time: the route proves each photo SERVES (cache
  // only, gateShut:true, spendAllowed:false) and holds back the rest.
  ok(/gateShut:\s*true/.test("resolvePlacePhoto({ ref, gateShut: true, spendAllowed: false })"), "CONTROL: the cache-only detector fires on a gateShut:true call");
  ok(/resolvePlacePhoto\(\{[^}]*gateShut:\s*true[^}]*spendAllowed:\s*false/.test(route.replace(/\s+/g, " ")), "the route resolves each card's photo in CACHE-ONLY mode (no Google, no spend)");
  ok(/type === "redirect"/.test(route) && /heldForPhoto/.test(route), "…ships only cards whose photo is served from cache, and counts the held ones");
  ok(!/photoRef/.test(JSON.stringify(Object.keys(extraMilesFrom(ORIGIN, [park(0, 60)], allPages)[0]).filter((k) => k !== "photoRef"))), "CONTROL: photoRef is a selector-side field");
  ok(/\(\{ photoRef, \.\.\.c \}\) => c/.test(route), "…and the raw photo_ref never ships to the browser");
  ok(/dynamic\(\(\) => import\("\.\/ExtraMilesTail"\)/.test(rail), "DaypartRail mounts the tail as its own lazy chunk");
  ok(/selected === "drive"[^\n]*<ExtraMilesTail/.test(rail.replace(/\n\s*/g, " ")), "…only when the drive drop is open");
  ok(!/<ExtraMilesTail[^>]*(places|dropList|shown)/.test(rail.replace(/\n\s*/g, " ")), "…and hands it only the reader's point — never the drive rail's cards");
  ok(/fetch\(`\/api\/extra-miles\?/.test(tailSrc) && !/\/api\/rails/.test(tailSrc), "the tail fetches its own route, never /api/rails");
  ok(/data\.cards\.length\) return null/.test(tailSrc), "an empty or failed answer renders nothing (no invented 'nothing worth the miles' sentence)");
  ok(/href=\{c\.href\}/.test(tailSrc) && !/viator|ticketmaster|affiliate/i.test(tailSrc), "cards link to /places pages; no affiliate surface in the tail");
}

console.log(`test-extra-miles: ${fail ? "FAIL" : "OK"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

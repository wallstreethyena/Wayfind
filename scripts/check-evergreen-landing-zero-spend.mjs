#!/usr/bin/env node
/**
 * check-evergreen-landing-zero-spend — the evergreen landing towns
 * (lib/evergreenCities.js) publish EXACTLY their qualifying pairs, and a
 * render of any of them can never spend a cent at Google.
 *
 * WHY (2026-09-30). Five towns (St. Petersburg, Naples, Fort Myers,
 * Jacksonville, St. Augustine) clear the landing quality bar from OWNED
 * inventory for 15 cat × city pairs; 5 more pairs do not. They were given
 * pages WITHOUT joining LANDING_CITIES, because that table feeds the
 * photo-warm cron (lib/photoWarm.js via lib/photoSurfaces.js landingCityList)
 * which buys photos several times an hour, and /api/rails, and the events
 * windows. The owner's constraint was ZERO new paid Google spend. Three ways
 * that could quietly break, each proven here by CALLING the code:
 *
 *   A. MEMBERSHIP — exactly the 15 pairs render (generateStaticParams of the
 *      four real route files) and enter the sitemap; the 5 withheld pairs are
 *      absent from both; no evergreen town gets an /events window.
 *   B. RANKING — landingRanked() for every evergreen pair with a cold
 *      inventory makes ZERO googleapis calls and asks the spend ledger ZERO
 *      times. POSITIVE CONTROL: the identical call for Sarasota (a
 *      LANDING_CITIES town whose runtime fallback is allowed to spend) DOES
 *      reach the ledger and places.googleapis.com searchText in the same rig.
 *   C. RENDER — the whole LandingPage for all 15 pairs, rendered to HTML with
 *      fixture inventory: zero googleapis / ledger calls, and every
 *      /api/photo URL in the markup (primary src AND the onError
 *      data-fallback) carries nospend=1. CONTROL: Sarasota's render of the
 *      same fixture carries spend-capable /api/photo URLs, so the assertion
 *      can tell the two apart.
 *   D. PHOTO ROUTE — app/api/photo/route.js, sourced and executed with the
 *      REAL lib/placePhotoServe resolvePlacePhoto and a fake upstream: the
 *      exact URLs the evergreen cards emit take zero ledger grants and make
 *      zero Google photo fetches. CONTROL: the same URLs without nospend=1
 *      take a grant and fetch.
 *   E. CRONS — landingCityList() (photo-warm's walk) contains no evergreen
 *      town (control: it contains sarasota), and nothing but the landing
 *      layer imports lib/evergreenCities.js.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const EXPECTED = [
  "things-to-do/st-petersburg", "restaurants/st-petersburg", "beaches/st-petersburg", "nightlife/st-petersburg",
  "things-to-do/naples", "restaurants/naples", "nightlife/naples",
  "things-to-do/fort-myers", "restaurants/fort-myers",
  "things-to-do/jacksonville", "restaurants/jacksonville", "nightlife/jacksonville",
  "restaurants/st-augustine", "nightlife/st-augustine",
];
const WITHHELD = ["beaches/naples", "beaches/fort-myers", "nightlife/fort-myers", "beaches/jacksonville", "things-to-do/st-augustine", "beaches/st-augustine"];
const CATS = ["things-to-do", "restaurants", "beaches", "nightlife"];
const TOWNS = ["st-petersburg", "naples", "fort-myers", "jacksonville", "st-augustine"];
ok(EXPECTED.length === 14 && WITHHELD.length === 6, "fixture sanity: 14 expected + 6 withheld pairs");

// ── Hermetic rig: one fetch recorder for everything below ────────────────────
const SB = "https://sb.evergreen-guard.invalid";
const ENV_KEYS = ["WAYFIND_GATE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "GOOGLE_MAPS_SERVER_KEY", "VERCEL_ENV", "NEXT_PHASE", "INSIDER_ENABLED", "WAYFIND_PHOTOS_PAID", "GOOGLE_PHOTOS_MONTH_CAP"];
for (const k of ENV_KEYS) delete process.env[k];
process.env.WAYFIND_GATE = "free";           // the ledger CAN say yes — so "0 asks" is meaningful
// Since #1582 the landing search charges text_enterprise and asks only when
// an Enterprise ceiling is configured (absent = denied before any ask). Rig-only
// value so the POSITIVE CONTROL below can still prove the rig sees spend.
process.env.GOOGLE_TEXT_ENTERPRISE_MONTH_CAP = "1000";
process.env.SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-service-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = SB;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "guard-anon-key";
process.env.GOOGLE_MAPS_SERVER_KEY = "guard-google-key";
process.env.VERCEL_ENV = "production";

let calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url && url.href ? url.href : url);
  if (/googleapis\.com/.test(u)) {
    calls.push({ kind: "google", u });
    return new Response(JSON.stringify({ places: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (u.includes("/rest/v1/rpc/wf_spend_take")) {
    let sku = null; try { sku = JSON.parse(init.body).p_sku; } catch {}
    calls.push({ kind: "ledger", sku, u });
    return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
  }
  if (u.startsWith(SB)) { calls.push({ kind: "supabase", u }); return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); }
  calls.push({ kind: "other", u });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const paid = () => calls.filter((c) => c.kind === "google" || c.kind === "ledger");

const landing = await loadComponent(path.join(ROOT, "lib/landing.js"), ROOT);
// LandingPage lives in lib/landingPage.js (kept off the homepage graph; see
// scripts/check-landing-data-client-free.mjs).
const landingPage = await loadComponent(path.join(ROOT, "lib/landingPage.js"), ROOT);
const ev = await import("../lib/evergreenCities.js");
const { LANDING_CITIES } = await import("../lib/landingCities.js");

// ── A. MEMBERSHIP ────────────────────────────────────────────────────────────
{
  const pairs = ev.evergreenPairs().map(([c, s]) => `${c}/${s}`);
  ok(pairs.length === 14, `evergreenPairs() has exactly 14 rows (got ${pairs.length})`);
  ok(JSON.stringify([...pairs].sort()) === JSON.stringify([...EXPECTED].sort()), `evergreenPairs() is exactly the 14 qualifying pairs (got ${pairs.join(", ")})`);
  const withheld = Object.entries(ev.EVERGREEN_WITHHELD).flatMap(([s, cs]) => cs.map((c) => `${c}/${s}`));
  ok(JSON.stringify(withheld.sort()) === JSON.stringify([...WITHHELD].sort()), "EVERGREEN_WITHHELD names exactly the 6 weak pairs");
  ok(TOWNS.every((t) => !Object.prototype.hasOwnProperty.call(LANDING_CITIES, t)), "no evergreen town is in LANDING_CITIES (that table feeds rails and photo-warm)");
  for (const k of EXPECTED) { const [c, s] = k.split("/"); const p = landing.landingPair(c, s); ok(p && p.evergreen === true && p.city && p.city.name, `landingPair(${k}) resolves as evergreen`); }
  for (const k of WITHHELD) { const [c, s] = k.split("/"); ok(landing.landingPair(c, s) === null, `landingPair(${k}) is null (withheld)`); }
  const ctl = landing.landingPair("beaches", "sarasota");
  ok(ctl && ctl.evergreen === false && JSON.stringify(ctl.city) === JSON.stringify(LANDING_CITIES.sarasota), "CONTROL: landingPair(beaches/sarasota) is the unchanged LANDING_CITIES row");

  // The four REAL route files, loaded and called.
  const routeRows = [];
  for (const cat of CATS) {
    const mod = await loadComponent(path.join(ROOT, `app/${cat}/[city]/page.js`), ROOT);
    ok(mod.dynamicParams === false, `app/${cat}/[city] keeps dynamicParams = false (an unlisted pair must 404)`);
    const params = mod.generateStaticParams().map((x) => x.city);
    const evRows = params.filter((c) => TOWNS.includes(c));
    routeRows.push(...evRows.map((c) => `${cat}/${c}`));
    const lc = params.filter((c) => Object.prototype.hasOwnProperty.call(LANDING_CITIES, c));
    ok(lc.length === Object.keys(LANDING_CITIES).length, `CONTROL: app/${cat}/[city] still lists every LANDING_CITIES slug (${lc.length}/${Object.keys(LANDING_CITIES).length})`);
    ok(params.length === lc.length + evRows.length && new Set(params).size === params.length, `app/${cat}/[city] params are LANDING_CITIES + evergreen, no strays or duplicates`);
  }
  ok(routeRows.length === 14 && JSON.stringify([...routeRows].sort()) === JSON.stringify([...EXPECTED].sort()),
    `generateStaticParams across the 4 routes yields exactly the 14 evergreen pairs (got ${routeRows.length}: ${routeRows.join(", ")})`);
  ok(WITHHELD.every((k) => !routeRows.includes(k)), "no withheld pair is prerendered");

  // The real sitemap, called.
  const sm = await loadComponent(path.join(ROOT, "app/sitemap.js"), ROOT);
  const urls = (await sm.default()).map((r) => r.url);
  const pathOf = (u) => u.replace(/^https?:\/\/[^/]+/, "");
  const evLanding = urls.map(pathOf).filter((p) => { const m = p.match(/^\/([a-z-]+)\/([a-z-]+)$/); return m && CATS.includes(m[1]) && TOWNS.includes(m[2]); });
  ok(evLanding.length === 14 && JSON.stringify(evLanding.map((p) => p.slice(1)).sort()) === JSON.stringify([...EXPECTED].sort()),
    `sitemap lists exactly the 14 evergreen landing URLs (got ${evLanding.length})`);
  ok(WITHHELD.every((k) => !urls.map(pathOf).includes("/" + k)), "sitemap lists none of the 6 withheld pairs");
  const evEvents = urls.map(pathOf).filter((p) => TOWNS.some((t) => p.startsWith(`/events/${t}/`)));
  ok(evEvents.length === 0, `no evergreen /events window in the sitemap (got ${evEvents.length})`);
  const sarasotaLanding = urls.map(pathOf).filter((p) => CATS.some((c) => p === `/${c}/sarasota`));
  const sarasotaEvents = urls.map(pathOf).filter((p) => p.startsWith("/events/sarasota/"));
  ok(sarasotaLanding.length === 4 && sarasotaEvents.length >= 1, `CONTROL: sarasota still has its 4 landing URLs and its event windows (${sarasotaLanding.length}, ${sarasotaEvents.length})`);
}

// ── B. RANKING: cold inventory → zero spend for evergreen, spend for control ─
{
  const cold = { serveFromInventory: async () => [] };
  for (const k of EXPECTED) {
    const [c, s] = k.split("/");
    calls = [];
    const list = await landing.landingRanked(c, s, cold);
    ok(Array.isArray(list) && list.length === 0, `${k}: cold inventory ranks to [] (honest thin state), got ${JSON.stringify(list && list.length)}`);
    ok(paid().length === 0, `${k}: cold inventory made ${paid().length} googleapis/ledger call(s): ${paid().map((x) => x.kind + ":" + (x.sku || x.u)).join(", ")}`);
  }
  for (const k of WITHHELD) {
    const [c, s] = k.split("/");
    calls = [];
    ok((await landing.landingRanked(c, s, cold)) === null && calls.length === 0, `${k}: withheld pair ranks to null with zero network calls`);
  }
  calls = [];
  await landing.landingRanked("things-to-do", "sarasota", cold);
  const ctlGoogle = calls.filter((x) => x.kind === "google" && /places:searchText/.test(x.u));
  const ctlLedger = calls.filter((x) => x.kind === "ledger" && x.sku === "text_enterprise");
  ok(ctlLedger.length >= 1 && ctlGoogle.length >= 1,
    `POSITIVE CONTROL: sarasota (spend-allowed LANDING_CITIES path) reaches the text_enterprise ledger (${ctlLedger.length}) and places:searchText (${ctlGoogle.length}) in this same rig — without this, "0 calls" above could mean the rig is blind`);
}

// ── C. RENDER: the whole page, 15 pairs, fixture inventory ───────────────────
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const TYPES = {
  "things-to-do": { types: ["museum", "tourist_attraction", "point_of_interest"], primaryType: "museum", category: "attractions" },
  restaurants: { types: ["restaurant", "food", "point_of_interest"], primaryType: "restaurant", category: "food" },
  beaches: { types: ["beach", "natural_feature", "tourist_attraction"], primaryType: "beach", category: "beach" },
  nightlife: { types: ["bar", "night_club", "point_of_interest"], primaryType: "bar", category: "nightlife" },
};
const idFor = (c, s, i) => ("ChIJEvg" + (c + s).replace(/[^a-z]/g, "").slice(0, 12) + "Q" + String(i).padStart(3, "0")).replace(/^(.{27}).*$/, "$1");
const fixture = (c, city, s) => Array.from({ length: 10 }, (_, i) => {
  const id = idFor(c, s, i);
  return {
    place_id: id, id, name: `Fixture ${c} ${i}`, rating: 4.3 + (i % 5) / 10, userRatingCount: 400 + i * 37,
    formattedAddress: `${i + 1} Main St, ${city.name}, FL`, businessStatus: "OPERATIONAL",
    location: { latitude: city.lat + i * 0.002, longitude: city.lng + i * 0.002 },
    // Half carry an owned Google photo ref (the spendable shape), half none
    // (the place-id rung) — both must come out no-spend.
    photoRef: i % 2 === 0 ? `places/${id}/photos/AXfixturePhoto${i}abcdefghij` : null,
    ...TYPES[c],
  };
});
const photoUrls = (html) => [...html.matchAll(/\/api\/photo\?[^"'\s>]*/g)].map((m) => m[0].replace(/&amp;/g, "&"));
const render = async (c, s, city) => {
  const el = await landingPage.LandingPage({ catSlug: c, citySlug: s, rankOpts: { inventoryRows: fixture(c, city, s) } });
  return renderToStaticMarkup(el);
};
{
  let totalCards = 0, totalPhotoUrls = 0;
  for (const k of EXPECTED) {
    const [c, s] = k.split("/");
    const city = landing.landingPair(c, s).city;
    calls = [];
    const html = await render(c, s, city);
    const cards = (html.match(/class="wf-place-card-rank"/g) || []).length;
    totalCards += cards;
    ok(cards >= 8, `${k}: fixture renders >= 8 ranked cards (got ${cards}) — the photo assertions below need real cards to mean anything`);
    ok(paid().length === 0, `${k}: full page render made ${paid().length} googleapis/ledger call(s): ${paid().map((x) => x.kind + ":" + (x.sku || x.u)).join(", ")}`);
    const pu = photoUrls(html);
    totalPhotoUrls += pu.length;
    const spendable = pu.filter((u) => !/[?&]nospend=1(&|$)/.test(u));
    ok(pu.length >= cards, `${k}: every card carries a photo URL or a no-spend fallback (${pu.length} URLs, ${cards} cards)`);
    ok(spendable.length === 0, `${k}: ${spendable.length} /api/photo URL(s) without nospend=1 — a reader view could buy a photo: ${spendable.slice(0, 3).join(" | ")}`);
    ok(!/\/api\/photo\?ref=[^"]*"[^>]*data-fallback="\/api\/photo\?place=[^"&]*&amp;g=2&amp;w=640"/.test(html), `${k}: the onError fallback is never a spend-capable place URL`);
    for (const w of WITHHELD) ok(!html.includes(`href="/${w}"`), `${k}: page links nowhere withheld (/${w})`);
    ok(!TOWNS.some((t) => html.includes(`href="/events/${t}`)), `${k}: page links to no evergreen /events window`);
  }
  ok(totalCards >= 14 * 8 && totalPhotoUrls >= totalCards, `sanity: ${totalCards} cards / ${totalPhotoUrls} photo URLs rendered across 14 pages`);
  // CONTROL: same fixture, a LANDING_CITIES town — its cards are spend-capable.
  calls = [];
  const ctlHtml = await render("restaurants", "sarasota", LANDING_CITIES.sarasota);
  const ctlUrls = photoUrls(ctlHtml);
  ok(ctlUrls.length > 0 && ctlUrls.some((u) => !/nospend=1/.test(u)),
    `CONTROL: sarasota's render of the same fixture carries spend-capable /api/photo URLs (${ctlUrls.length} URLs) — proves the nospend assertion discriminates`);
}

// ── D. PHOTO ROUTE: the real route + real resolver, fake upstream ────────────
{
  const { resolvePlacePhoto, FALLBACK_PATH, PHOTO_REF_RX, placeIdFromRef } = await import("../lib/placePhotoServe.js");
  const { gateShut, spendAllow, spendAllowPhotos } = await import("../lib/spendGate.js");
  const { landingCardPhotoSrc } = await import("../lib/placePhoto.js");
  // #1587: the route keeps photo credits from the Details response it already
  // read. Bound to the REAL keeper: no Google call; its Supabase write lands in
  // this rig's recording fetch, so the zero-spend assertions still see it.
  const { keepPhotoCredits } = await import("../lib/photoCredits.js");
  let googlePhotoFetches = 0;
  const deps = {
    cacheGet: async () => null, cacheSet: async () => {}, cacheDel: async () => {},
    inventoryGet: async () => null, probeUri: async () => null,
    breakerOpen: async () => null, tripBreaker: async () => {},
    fetchOwnedUri: async () => { googlePhotoFetches++; return { uri: "https://lh3.googleusercontent.com/p/fake", status: 200, upstream: "ok" }; },
  };
  globalThis.__wfEvergreenGuard = {
    FALLBACK_PATH, PHOTO_REF_RX, placeIdFromRef, gateShut, spendAllow, spendAllowPhotos,
    resolvePlacePhoto: (input) => resolvePlacePhoto(input, deps),
    findSamePlaceCachedPhoto: async () => null, findFreePhoto: async () => null,
    recordReaderPhotoMiss: async () => false, recordPhotoOutcome: async () => {}, recordPhotoDeniedCeiling: async () => {},
    photosCeiling: () => 0,
    keepPhotoCredits,
  };
  const routeSrc = readFileSync(path.join(ROOT, "app/api/photo/route.js"), "utf8");
  // Same sourcing technique as scripts/test-free-photo-serving.mjs: strip the
  // imports, bind each imported name to the rig. Values stay values.
  const G = "globalThis.__wfEvergreenGuard";
  const fns = Object.keys(globalThis.__wfEvergreenGuard).filter((n) => typeof globalThis.__wfEvergreenGuard[n] === "function");
  const prelude = [
    "const NextResponse = {",
    "  json(v, init = {}) { return new Response(JSON.stringify(v), { status: (init && init.status) || 200, headers: init && init.headers }); },",
    "  redirect(url, init = {}) { const h = new Headers((init && init.headers) || {}); h.set(\"location\", String(url)); return new Response(null, { status: (init && init.status) || 307, headers: h }); },",
    "};",
    `const FALLBACK_PATH = ${G}.FALLBACK_PATH;`,
    `const PHOTO_REF_RX = ${G}.PHOTO_REF_RX;`,
    ...fns.map((n) => `const ${n} = (...a) => ${G}.${n}(...a);`),
  ].join("\n");
  const importedNames = [...routeSrc.matchAll(/^import\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean));
  const bound = new Set(["NextResponse", "FALLBACK_PATH", "PHOTO_REF_RX", ...fns]);
  ok(importedNames.every((n) => bound.has(n)), `PROBE: every name the route imports is bound by the rig (unbound: ${importedNames.filter((n) => !bound.has(n)).join(", ") || "none"})`);
  const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + routeSrc.replace(/^import[^;]+;\n/gm, "")));
  ok(typeof route.GET === "function", "PROBE: app/api/photo/route.js was sourced and exposes GET");

  const pid = "ChIJEvgRouteProbe0000001";
  const withRef = { id: pid, photoRef: `places/${pid}/photos/AXrouteProbePhoto0123456789` };
  const withoutRef = { id: pid };
  const evRefUrl = landingCardPhotoSrc(withRef, { noSpend: true });
  const evPlaceUrl = landingCardPhotoSrc(withoutRef, { noSpend: true });
  ok(/^\/api\/photo\?ref=.*&nospend=1$/.test(evRefUrl), `the evergreen ref URL is built by landingCardPhotoSrc with nospend=1 (${evRefUrl})`);
  ok(/^\/api\/photo\?place=.*&nospend=1$/.test(evPlaceUrl), `the evergreen place URL is built by landingCardPhotoSrc with nospend=1 (${evPlaceUrl})`);
  ok(landingCardPhotoSrc(withoutRef) === "", "CONTROL: the non-evergreen ladder is unchanged (no ref, no url → \"\")");
  const hit = async (rel) => {
    calls = []; googlePhotoFetches = 0;
    const res = await route.GET(new Request("https://www.gowayfind.com" + rel));
    return { res, ledger: calls.filter((c) => c.kind === "ledger").length, google: googlePhotoFetches + calls.filter((c) => c.kind === "google").length };
  };
  for (const u of [evRefUrl, evPlaceUrl]) {
    const r = await hit(u);
    ok(r.ledger === 0 && r.google === 0, `${u.slice(0, 40)}…: the evergreen card URL took ${r.ledger} ledger grant(s) and made ${r.google} Google photo fetch(es) — must be 0/0`);
    ok(r.res.status === 404 && r.res.headers.get("x-wayfind-photo-result") === "probe-no-spend", `${u.slice(0, 40)}…: an uncached evergreen photo is an honest no-spend miss (monogram), got ${r.res.status} ${r.res.headers.get("x-wayfind-photo-result")}`);
  }
  const ctlRef = await hit(evRefUrl.replace("&nospend=1", ""));
  ok(ctlRef.ledger >= 1 && ctlRef.google >= 1 && ctlRef.res.headers.get("x-wayfind-photo-result") === "google",
    `POSITIVE CONTROL: the same ref URL WITHOUT nospend=1 takes a grant (${ctlRef.ledger}) and fetches from Google (${ctlRef.google}) — so 0/0 above is the flag, not a blind rig`);
  const ctlPlace = await hit(evPlaceUrl.replace("&nospend=1", ""));
  ok(ctlPlace.ledger >= 1, `POSITIVE CONTROL: the same place URL WITHOUT nospend=1 asks the ledger (${ctlPlace.ledger}) via place discovery`);
}

// ── F. RAILS: the two client/server rails that carry their OWN photo URLs ────
// Found by rendering against REAL inventory (2026-10-01): St. Petersburg
// resolves to the Tampa metro, so /things-to-do/st-petersburg rendered the
// statewide "Florida's Biggest Parks" rail, whose cards use spend-capable
// /api/photo URLs. The fixture rig above returns no park rows, so section C
// could not see it. Evergreen pages never mount that rail or read its seed.
// IntentPartnerPick (client; fills from /api/deals on mount) builds a deal's
// Google-ref photo URL — evergreen pages pass photoNoSpend so it carries nospend=1.
{
  const { LANDING_CITIES: LC } = await import("../lib/landingCities.js");
  const parkQuery = (cs) => cs.filter((c) => c.kind === "supabase" && /name\.ilike/.test(decodeURIComponent(c.u)));
  calls = [];
  const evHtml = await render("things-to-do", "st-petersburg", landing.landingPair("things-to-do", "st-petersburg").city);
  ok(parkQuery(calls).length === 0, "st-petersburg (Tampa metro) things-to-do read no theme-park seed");
  ok(!/Biggest Parks/.test(evHtml), "st-petersburg things-to-do does not mount the Florida's Biggest Parks rail");
  const tampaSlug = Object.keys(LC).find((k) => k === "tampa");
  ok(!!tampaSlug, "PROBE: tampa is a LANDING_CITIES town (the control)");
  calls = [];
  const tHtml = await render("things-to-do", "tampa", LC.tampa);
  ok(parkQuery(calls).length >= 1 && tHtml.length > 1000, `CONTROL: tampa things-to-do (LANDING_CITIES) DOES read the theme-park seed (${parkQuery(calls).length}) in this same rig`);
  const ipp = strip(readFileSync(path.join(ROOT, "app/components/IntentPartnerPick.js"), "utf8"));
  ok(/const dealImage = \(deal, noSpend\) =>[^;]*nospend=1/.test(ipp) && /dealImage\(deal, photoNoSpend\)/.test(ipp), "IntentPartnerPick builds a deal's Google-ref photo with nospend=1 when photoNoSpend (SOURCE check: client effect, not executable here)");
  const lsrc = strip(readFileSync(path.join(ROOT, "lib/landingPage.js"), "utf8"));
  ok(/<IntentPartnerPick[\s\S]*?photoNoSpend=\{evergreen\}/.test(lsrc), "landingPage.js passes photoNoSpend={evergreen} to <IntentPartnerPick>");
}

// ── G. LOCATION: a venue from the next metro never ranks on an evergreen page ─
// Found 2026-10-01 against real inventory: the owned-inventory read is a lat/lng
// BOX (corners ~1.4x the radius), so /things-to-do/st-augustine ranked "Game Over
// Escape Rooms Jacksonville" (17.9 mi up the road) FIRST. Evergreen ranking now
// clamps to true haversine miles <= the 17 mi tight radius (opts.maxMi).
{
  const withFar = (c, city, s) => {
    const rows = fixture(c, city, s);
    const dLat = 18.5 / 69; // ~18.5 mi north: inside the read's box corner, outside the radius
    rows.push({ ...rows[0], place_id: "ChIJEvgFarAwayMetro00001", id: "ChIJEvgFarAwayMetro00001", name: "Far Metro Venue", rating: 4.9, userRatingCount: 9000,
      location: { latitude: city.lat + dLat, longitude: city.lng }, photoRef: null });
    return rows;
  };
  for (const k of EXPECTED) {
    const [c, s] = k.split("/");
    const city = landing.landingPair(c, s).city;
    const list = await landing.landingRanked(c, s, { inventoryRows: withFar(c, city, s) });
    ok(Array.isArray(list) && list.length >= 8, `${k}: clamp keeps the in-city fixture (${list && list.length} ranked)`);
    ok(!list.some((p) => p.name === "Far Metro Venue"), `${k}: a 4.9-star, 9000-review venue 18.5 mi away is NOT ranked`);
    ok(list.every((p) => p.distMi == null || p.distMi <= 17.01), `${k}: every ranked place is within 17 mi (max ${Math.max(...list.map((p) => p.distMi || 0)).toFixed(1)})`);
  }
  const sar = LANDING_CITIES.sarasota;
  const ctl = await landing.rankedFor("things-to-do", "sarasota", { inventoryRows: withFar("things-to-do", sar, "sarasota"), inventoryOnly: true });
  ok(Array.isArray(ctl) && ctl.some((p) => p.name === "Far Metro Venue"), "CONTROL: sarasota (LANDING_CITIES, unchanged ranking) still ranks the same far venue — the clamp is evergreen-only");
}

// ── E. CRONS: photo-warm's walk, and who may import the evergreen table ──────
{
  const { landingCityList } = await import("../lib/photoSurfaces.js");
  const walked = landingCityList().map((c) => c.slug);
  ok(walked.includes("sarasota"), "CONTROL: photo-warm's landingCityList() walks sarasota");
  ok(TOWNS.every((t) => !walked.includes(t)), `photo-warm's landingCityList() walks no evergreen town (walks: ${walked.length})`);
  const files = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js|jsx)$/.test(n)) files.push(p);
    }
  };
  for (const d of ["app", "lib", "scripts"]) walk(path.join(ROOT, d));
  const importers = files.filter((f) => /\bevergreenCities(\.js)?["']/.test(strip(readFileSync(f, "utf8")))).map((f) => path.relative(ROOT, f)).sort();
  // + two scripts that are not crons/rails: the owner-run live evidence audit
  // (Google refused inside it) and the fixture eligibility test.
  const ALLOWED = ["lib/landing.js", "lib/landingPage.js", "scripts/audit-evergreen-evidence.mjs", "scripts/check-evergreen-landing-zero-spend.mjs", "scripts/test-evergreen-eligibility.mjs"];
  ok(importers.includes("lib/landing.js"), "PROBE: the importer scan finds the known importer lib/landing.js");
  ok(JSON.stringify(importers) === JSON.stringify(ALLOWED), `only the landing layer imports lib/evergreenCities.js — a cron or rail that adopts it would start spending on these towns (importers: ${importers.join(", ")})`);
  console.log(`  scanned ${files.length} files for evergreenCities importers`);
}

globalThis.fetch = realFetch;
if (failures) {
  console.error(`check-evergreen-landing-zero-spend: FAIL (${failures}/${asserts})`);
  process.exit(1);
}
console.log(`check-evergreen-landing-zero-spend: OK (${asserts} assertions — 14 pairs published, 6 withheld, 0 googleapis/ledger calls across 14 ranked + 14 rendered pages, positive controls reached)`);
process.exit(0);

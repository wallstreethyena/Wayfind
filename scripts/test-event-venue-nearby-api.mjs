#!/usr/bin/env node
// test-event-venue-nearby-api: GET /api/events/venue-nearby, EXECUTED.
//
// The route hands the browser the nearby picks and the stays around the point Apple verified for
// a provider venue (app/components/EventNearbyReanchor.js). It must stay a FREE, OWNED-INVENTORY
// read: same two reads the event page runs on the server, rounded inputs so a scraper cannot mint
// unbounded cache entries, a degraded answer that never sits in a shared cache, and the same
// same-origin + per-IP guard as /api/search. Asserts on response BODIES and HEADERS, not statuses
// alone, and calls the real createHandler with injected readers (no network, no env).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (condition, message) => { if (condition) pass++; else fail.push(message); };
const stripped = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const route = await loadComponent(path.join(ROOT, "app/api/events/venue-nearby/route.js"), ROOT);
const { createHandler, parseVenueNearbyQuery, VENUE_NEARBY_CACHE_CONTROL } = route;
ok(typeof createHandler === "function" && typeof route.GET === "function", "the route exports createHandler and a default GET");
ok(route.dynamic === "force-dynamic", "the route is force-dynamic (it reads query params)");
ok(VENUE_NEARBY_CACHE_CONTROL === "public, s-maxage=3600, stale-while-revalidate=86400", "the success cache policy is the specified edge cache");

const SITE = "https://www.gowayfind.com";
const url = (qs) => `${SITE}/api/events/venue-nearby?${qs}`;
const GOOD = "lat=27.77341&lng=-82.65324&name=Rays+vs+Yankees&city=St.+Petersburg&date=2026-10-25&time=19:05&segment=Sports&genre=Baseball&placeId=ChIJkXdv95vhwogR3e84WZCqrJ4";
const pickRow = (id) => ({ id, name: `Place ${id}`, city: "St. Petersburg", rating: 4.6, reviews: 500, wfScore: 91, cat: "Restaurant", lat: 27.77, lng: -82.65, distMi: 0.4 });
const stayRow = (id) => ({ id, name: `Hotel ${id}`, detailHref: `/p/${id}`, lat: 27.77, lng: -82.65, distMi: 0.6, wfScore: 90 });

function fakes({ pairings, stays } = {}) {
  const log = { pairings: [], stays: [] };
  return {
    log,
    handler: createHandler({
      pairings: pairings || (async (event) => { log.pairings.push(event); return { places: [pickRow("p1"), pickRow("p2")], unavailable: false }; }),
      stays: stays || (async (lat, lng) => { log.stays.push([lat, lng]); return { places: [stayRow("h1")], unavailable: false }; }),
    }),
  };
}
const call = async (handler, qs, init) => {
  const response = await handler(new Request(url(qs), init));
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* asserted by callers via body === null */ }
  return { status: response.status, headers: response.headers, body };
};

// 1a. CACHE-KEY ARGUMENTS ARE SHAPE-CHECKED (reviewer, 2026-10-22): free text in
// Data Cache key args would let a same-origin script mint entries; an
// off-shape value is dropped (not an error) so a legitimate page still answers.
{
  const { handler, log } = fakes();
  const r = await call(handler, "lat=27.77341&lng=-82.65324&name=Rays+vs+Yankees&city=St.+Petersburg+%3Cscript%3E99&date=25-10-2026&time=7pm&segment=Sports&genre=Baseball&placeId=not-a-place-id");
  ok(r.status === 200 && log.pairings.length === 1, "off-shape cache-key fields still answer 200 (dropped, not refused)");
  const event = log.pairings[0];
  ok(event.place_id === null, `an off-shape placeId is dropped (got ${JSON.stringify(event.place_id)})`);
  ok(event.city === null, `a city with digits or markup is dropped (got ${JSON.stringify(event.city)})`);
  ok(event.date === "" && event.time === "", `a date or clock outside its stored shape is dropped (got ${JSON.stringify([event.date, event.time])})`);
  const r2 = await call(handler, GOOD);
  ok(r2.status === 200 && log.pairings[1].place_id === "ChIJkXdv95vhwogR3e84WZCqrJ4" && log.pairings[1].city === "St. Petersburg" && log.pairings[1].date === "2026-10-25" && log.pairings[1].time === "19:05", "well-shaped fields pass through unchanged (positive control)");
  ok((await call(handler, "lat=27.77341&lng=-82.65324&name=Rays&city=Saint+Petersburg&placeId=ChIJkXdv95vhwogR3e84WZCqrJ4")).status === 200 && log.pairings[2].city === "Saint Petersburg", "a city with spaces and letters only is kept");
}

// 1. THE SUCCESS PATH.
{
  const { handler, log } = fakes();
  const r = await call(handler, GOOD);
  ok(r.status === 200 && /application\/json/.test(r.headers.get("content-type") || ""), "a good request answers 200 JSON");
  ok(r.headers.get("cache-control") === "public, s-maxage=3600, stale-while-revalidate=86400", `a complete answer carries the specified Cache-Control (got ${r.headers.get("cache-control")})`);
  ok(r.body && r.body.point.lat === 27.7734 && r.body.point.lng === -82.6532, `the point is ROUNDED to 4 decimals before use (got ${JSON.stringify(r.body && r.body.point)})`);
  ok(log.pairings.length === 1 && log.pairings[0].lat === 27.7734 && log.pairings[0].lng === -82.6532, "the pairings reader got the rounded point");
  ok(log.stays.length === 1 && log.stays[0][0] === 27.7734 && log.stays[0][1] === -82.6532, "the stays reader got the rounded point");
  const event = log.pairings[0];
  ok(event.name === "Rays vs Yankees" && event.city === "St. Petersburg" && event.date === "2026-10-25" && event.time === "19:05" && event.segment === "Sports" && event.genre === "Baseball" && event.place_id === "ChIJkXdv95vhwogR3e84WZCqrJ4", `the event facts reach the outing classifier unchanged (got ${JSON.stringify(event)})`);
  ok(r.body.picks.length === 2 && r.body.picks.every((p) => typeof p.href === "string" && p.href.startsWith(`/p/${encodeURIComponent(p.id)}?`) && p.href.includes("t=Place")), "every pick carries its /p/ href (pairingHref), so the card and the pin are tappable");
  ok(r.body.picks[0].id === "p1" && r.body.picks[1].id === "p2", "picks keep the reader's order");
  ok(r.body.stays.length === 1 && r.body.stays[0].id === "h1" && r.body.stays[0].detailHref === "/p/h1", "stays pass through with their detailHref");
  ok(JSON.stringify(r.body.unavailable) === JSON.stringify({ picks: false, stays: false }), "nothing unavailable on a complete answer");
}

// 2. ROUNDING: 4 decimals, both signs, nothing finer survives.
{
  const { handler, log } = fakes();
  const a = await call(handler, "lat=27.123449&lng=-82.987651");
  ok(a.body.point.lat === 27.1234 && a.body.point.lng === -82.9877, `27.123449,-82.987651 -> 27.1234,-82.9877 (got ${JSON.stringify(a.body.point)})`);
  const b = await call(handler, "lat=27.1234&lng=-82.9877");
  ok(log.stays[0][0] === log.stays[1][0] && log.stays[0][1] === log.stays[1][1], "two requests inside the same 11 m cell reach the reader with the SAME arguments (one cache entry)");
  ok(a.status === 200 && b.status === 200, "no event facts is allowed (they only sharpen the slots)");
  ok(log.pairings[0].name === "" && log.pairings[0].city === null && log.pairings[0].place_id === null, "missing facts arrive as empty / null, never undefined");
}

// 3. VALIDATION: 400 JSON, never reaching a reader.
{
  const { handler, log } = fakes();
  const bad = {
    "missing lat and lng": "name=x",
    "missing lng": "lat=27.7",
    "empty lat": "lat=&lng=-82.6",
    "non-numeric lat": "lat=abc&lng=-82.6",
    "Infinity": "lat=Infinity&lng=-82.6",
    "lat out of range": "lat=91&lng=-82.6",
    "negative lat out of range": "lat=-90.5&lng=-82.6",
    "lng out of range": "lat=27.7&lng=181",
    "Null Island": "lat=0&lng=0",
    "rounds to Null Island": "lat=0.00001&lng=-0.00002",
    "name over 120": `lat=27.7&lng=-82.6&name=${"n".repeat(121)}`,
    "city over 80": `lat=27.7&lng=-82.6&city=${"c".repeat(81)}`,
    "date over 80": `lat=27.7&lng=-82.6&date=${"d".repeat(81)}`,
    "time over 80": `lat=27.7&lng=-82.6&time=${"t".repeat(81)}`,
    "segment over 80": `lat=27.7&lng=-82.6&segment=${"s".repeat(81)}`,
    "genre over 80": `lat=27.7&lng=-82.6&genre=${"g".repeat(81)}`,
    "placeId over 80": `lat=27.7&lng=-82.6&placeId=${"p".repeat(81)}`,
  };
  for (const [label, qs] of Object.entries(bad)) {
    const r = await call(handler, qs);
    ok(r.status === 400 && r.body && typeof r.body.error === "string" && r.body.error.length > 0, `${label}: 400 with a JSON error message (got ${r.status} ${JSON.stringify(r.body)})`);
    ok(/no-store/.test(r.headers.get("cache-control") || ""), `${label}: the 400 is never cached`);
  }
  ok(log.pairings.length === 0 && log.stays.length === 0, "no invalid request ever reached the pairings or stays reader");
  const edge = await call(handler, `lat=27.7&lng=-82.6&name=${"n".repeat(120)}&city=${"c".repeat(80)}`);
  ok(edge.status === 200, "a name of exactly 120 and a city of exactly 80 characters are accepted");
  ok((await call(handler, "lat=-27.7&lng=-182")).status === 400, "longitude beyond -180 is refused");
  const parsed = parseVenueNearbyQuery(url("lat=27.77341&lng=-82.65324&name=%20%20Hall%20%20"));
  ok(parsed.ok && parsed.query.name === "Hall" && parsed.query.lat === 27.7734, "text fields are trimmed and the query is parsed once");
}

// 4. PARTIAL FAILURE: each half degrades alone, and a degraded answer is not cached.
{
  const pickThrows = fakes({ pairings: async () => { throw new Error("pairing inventory down"); } });
  const a = await call(pickThrows.handler, GOOD);
  ok(a.status === 200 && JSON.stringify(a.body.unavailable) === JSON.stringify({ picks: true, stays: false }), `a throwing picks reader flags picks only (got ${JSON.stringify(a.body && a.body.unavailable)})`);
  ok(a.body.picks.length === 0 && a.body.stays.length === 1, "the surviving half is still returned");
  ok(/no-store/.test(a.headers.get("cache-control")) && !/s-maxage/.test(a.headers.get("cache-control")), "a degraded answer is not stored in a shared cache");
  const stayRejects = fakes({ stays: async () => { throw new Error("stays down"); } });
  const b = await call(stayRejects.handler, GOOD);
  ok(JSON.stringify(b.body.unavailable) === JSON.stringify({ picks: false, stays: true }) && b.body.picks.length === 2 && b.body.stays.length === 0, "a rejecting stays reader flags stays only");
  const flagged = fakes({ pairings: async () => ({ places: [], unavailable: true }), stays: async () => ({ places: [], unavailable: true }) });
  const c = await call(flagged.handler, GOOD);
  ok(c.status === 200 && JSON.stringify(c.body.unavailable) === JSON.stringify({ picks: true, stays: true }) && c.body.picks.length === 0 && c.body.stays.length === 0, "readers that report unavailable (their own swallowed failure) flag both halves");
  const empty = fakes({ pairings: async () => ({ places: [], unavailable: false }), stays: async () => ({ places: [], unavailable: false }) });
  const d = await call(empty.handler, GOOD);
  ok(JSON.stringify(d.body.unavailable) === JSON.stringify({ picks: false, stays: false }) && /s-maxage=3600/.test(d.headers.get("cache-control")), "an honestly empty shelf is NOT unavailable and is cached like any complete answer");
  const garbage = fakes({ pairings: async () => null, stays: async () => ({ places: "nope", unavailable: false }) });
  const e = await call(garbage.handler, GOOD);
  ok(JSON.stringify(e.body.unavailable) === JSON.stringify({ picks: true, stays: true }), "a reader that returns the wrong shape is treated as unavailable, not trusted");
}

// 5. PARALLEL: both reads start before either finishes (a sequential handler deadlocks on the gate).
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const parallel = createHandler({
    pairings: async () => { await gate; return { places: [pickRow("p1")], unavailable: false }; },
    stays: async () => { release(); return { places: [stayRow("h1")], unavailable: false }; },
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("handler ran the readers one after the other")), 2000));
  let r = null;
  try { r = await Promise.race([call(parallel, GOOD), timeout]); } catch (error) { fail.push(`readers run in parallel (Promise.allSettled): ${error.message}`); }
  ok(r && r.status === 200 && r.body.picks.length === 1 && r.body.stays.length === 1, "pairings and stays run in parallel and both land");
}

// 6. DEFAULT WIRING: GET is createHandler() with the shared cached readers, and it validates before touching them.
{
  const r = await call(route.GET, "lat=oops&lng=1");
  ok(r.status === 400, "the shipped GET answers a bad request with 400 without reading anything");
}

// 7. NO PAID PROVIDER. Read the route file, then walk every module it can reach.
const routeSrc = read("app/api/events/venue-nearby/route.js");
const routeCode = stripped(routeSrc);
const specifiers = (code) => [...code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);
const PAID = /(^|\/)(google[^/]*|serpapi[^/]*|foursquare[^/]*|fsq[^/]*)(\.[mc]?js)?$/i;
const paidIn = (code) => specifiers(code).filter((spec) => PAID.test(spec));
ok(paidIn('import a from "../../../../lib/googlePlaces.js"; import b from "./serpapiClient.js"; const c = await import("./foursquare.js");').length === 3, "probe control: the paid-import probe flags google / serpapi / foursquare specifiers in a synthetic source");
ok(paidIn(routeCode).length === 0, `the route file imports nothing from lib/google*, lib/serpapi* or lib/foursquare* (found ${JSON.stringify(paidIn(routeCode))})`);
ok(JSON.stringify(specifiers(routeCode).sort()) === JSON.stringify(["../../../../lib/eventPairings.js", "../../../../lib/eventPairingsCache.js", "../../../../lib/eventStaysCached.js", "next/server"].sort()), `the route's imports are exactly the cached pairings reader, pairingHref, the cached stays reader and NextResponse (got ${JSON.stringify(specifiers(routeCode))})`);
ok(/createHandler\(\{\s*pairings\s*=\s*cachedEventPairings,\s*stays\s*=\s*cachedEventStays\s*\}\s*=\s*\{\}\)/.test(routeCode) && /export const GET = createHandler\(\)/.test(routeCode), "the shipped GET is createHandler() wired to cachedEventPairings and cachedEventStays");
ok(!/\beventPairings\s*\(/.test(routeCode) && !/\beventStays\s*\(/.test(routeCode), "the route never calls eventPairings() or eventStays() directly: only the cached readers");
function reachable(entryRel) {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    for (const spec of specifiers(stripped(read(rel)))) {
      if (!spec.startsWith(".")) continue;
      const base = path.join(path.dirname(rel), spec);
      const hit = [base, base + ".js", base + ".mjs", path.join(base, "index.js")].find((c) => /\.m?js$/.test(c) && existsSync(path.join(ROOT, c)));
      if (hit) visit(hit);
    }
  };
  visit(entryRel);
  return [...seen];
}
const graph = reachable("app/api/events/venue-nearby/route.js");
ok(graph.includes("lib/eventStays.js") && graph.includes("lib/eventPairings.js") && graph.includes("lib/eventPairingsCache.js") && graph.includes("lib/nearbyPool.js") && graph.length > 20, `probe control: the walk reaches the real readers (${graph.length} modules, incl. eventStays, eventPairings, nearbyPool)`);
const paidReached = graph.filter((rel) => PAID.test(rel));
ok(paidReached.length === 0, `no module reachable from the route is a google / serpapi / foursquare module (found ${JSON.stringify(paidReached)})`);

// 8. THE STAYS READ IS THE PAGE'S: one helper, one cache entry per point, eventStays({ lat, lng }) and nothing else.
{
  const { createCachedEventStays, EVENT_STAYS_CACHE_KEY, EVENT_STAYS_REVALIDATE_SECONDS } = await loadComponent(path.join(ROOT, "lib/eventStaysCached.js"), ROOT);
  let captured = null;
  const seenArgs = [];
  const wrapped = createCachedEventStays({
    cache: (fn, keys, options) => { captured = { keys, options }; return fn; },
    load: async (...args) => { seenArgs.push(args); return { places: [], unavailable: false }; },
  });
  await wrapped(27.7734, -82.6532);
  ok(/^event-stays-v\d+$/.test(EVENT_STAYS_CACHE_KEY) && JSON.stringify(captured.keys) === JSON.stringify([EVENT_STAYS_CACHE_KEY]) && captured.options.revalidate === 3600 && EVENT_STAYS_REVALIDATE_SECONDS === 3600, "the shared helper keeps the page's event-stays-vN cache key (one key for the rail and the route) and its hour-long revalidate");
  ok(seenArgs.length === 1 && seenArgs[0].length === 1 && JSON.stringify(Object.keys(seenArgs[0][0]).sort()) === JSON.stringify(["lat", "lng"]) && seenArgs[0][0].lat === 27.7734 && seenArgs[0][0].lng === -82.6532, `eventStays is called with exactly { lat, lng }, the options the page uses (got ${JSON.stringify(seenArgs[0])})`);
  const staysComponent = stripped(read("app/components/EventStays.js"));
  ok(/import \{ cachedEventStays \} from "\.\.\/\.\.\/lib\/eventStaysCached\.js"/.test(staysComponent) && /await cachedEventStays\(lat, lng\)/.test(staysComponent), "the server-rendered stays rail reads through the SAME shared helper");
  ok(!/unstable_cache|event-stays-v4/.test(staysComponent), "the rail no longer builds a second cache of its own");
  ok(/import \{ cachedEventStays \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/eventStaysCached\.js"/.test(routeCode), "the route imports that same helper");
}

// 9. MIDDLEWARE: the route is in the matcher next to /api/search, and gets the FULL guard.
{
  const mw = await loadComponent(path.join(ROOT, "middleware.js"), ROOT);
  const matcher = mw.config && mw.config.matcher;
  ok(Array.isArray(matcher) && matcher.includes("/api/events/venue-nearby"), "middleware config.matcher contains /api/events/venue-nearby");
  ok(Array.isArray(matcher) && matcher.indexOf("/api/events/venue-nearby") === matcher.indexOf("/api/search") + 1, "it sits immediately after /api/search, the route it mirrors");
  ok(Array.isArray(matcher) && matcher.filter((p) => p === "/api/events/venue-nearby").length === 1, "it is listed exactly once");
  const mwCode = stripped(read("middleware.js"));
  const block = /matcher:\s*\[([\s\S]*?)\n\s*\]/.exec(mwCode);
  ok(block && /"\/api\/search",\s*"\/api\/events\/venue-nearby"/.test(block[1]), "the literal matcher block lists the path right after /api/search");
  const nav = /const NAV_302_ROUTES = new Set\(\[([^\]]*)\]\)/.exec(mwCode);
  const image = /const IMAGE_ROUTES = new Set\(\[([^\]]*)\]\)/.exec(mwCode);
  ok(nav && image && !/venue-nearby/.test(nav[1]) && !/venue-nearby/.test(image[1]), "it is in neither the navigation nor the image rate-limit-only sets: same-origin guard applies, like /api/search");
  ok(!/venue-nearby/.test(mwCode.replace(block ? block[0] : "", "")), "nothing else in middleware special-cases it");
}

if (fail.length) {
  console.error(`test-event-venue-nearby-api: FAIL - ${fail.length} of ${pass + fail.length} assertions`);
  for (const f of fail) console.error("  FAIL: " + f);
  process.exit(1);
}
console.log(`test-event-venue-nearby-api: OK - ${pass} assertions (real handler with injected readers: 400s with JSON errors, 4-decimal rounding, event facts forwarded, hrefs on picks, parallel partial failure flags, degraded answers uncached, no paid provider reachable from the route, shared stays cache helper called with { lat, lng }, middleware matcher next to /api/search with the full guard).`);
process.exit(0);

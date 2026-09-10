#!/usr/bin/env node
/**
 * test-rails-failed-is-not-covered — a failed ranking is an outage, never a
 * fact about the reader's town.
 *
 * THE INCIDENT (owner's iPhone, 2026-09-07 09:19 EDT). Screenshot: "Showing
 * Best Breakfast Picks near Cortez" over two rails that both read "No nearby
 * place clearly qualifies for this rail yet." PostHog for the same minute:
 * rail_open city=cortez has_places=0 on breakfast, augtober and trending in a
 * row. Production /api/rails for the same cell, asked by hand two minutes
 * later: 12 breakfast places, railTotals.breakfast 51. Vercel at 08:51 the same
 * morning: "/api/birthday inventory unavailable — All owned inventory reads
 * failed: The operation was aborted due to timeout". Supabase was slow; the
 * rails build blew its 9s deadline; railMenuData returned failed:true — and the
 * ROUTE still answered `covered: true` with an empty payload wearing the
 * reader's own city label. The browser adopted it as a successful ranking of
 * Cortez, and two composers said his town had no breakfast.
 *
 * Three layers, each asserted here, because the previous two fixes (v8.73
 * carried `failed` out of railMenuData; v8.74 stopped caching it) both missed
 * the one field the client actually reads:
 *
 *   1. lib/locationHonesty.js — a payload that says failed anywhere is an
 *      honest empty, never a covered city. EXECUTED, not grepped.
 *   2. app/api/rails/route.js — the degraded and thrown branches answer
 *      `covered: false, failed: true` with no data, and the `covered: true`
 *      return is only reachable when the build completed.
 *   3. app/components/DaypartRail.js — a failed answer lands on LOAD_FAILED
 *      ("couldn't reach the ranking service", Try again), NOT on "uncovered"
 *      ("Wayfind isn't live here yet"); and the two composers fed by
 *      /api/rails (breakfast, eat) render nothing of their own until the rails
 *      request has actually landed. A ranked healthy zero then produces no
 *      rail shell, while a service failure remains in DaypartRail's retry UI.
 *
 * Red-proved on 2026-09-07 by (a) restoring the old `covered: true` return on
 * the degraded path, (b) deleting the isFailedRailsResponse read in apply(),
 * (c) dropping `&& !composerWaiting` from the BreakfastRails render — each
 * turned exactly the matching assertion red.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyRailLive, liveFromRailsResponse, isFailedRailsResponse } from "../lib/locationHonesty.js";
import { railRenderState, RAIL_RENDER_STATE } from "../lib/railVisibility.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
// Strip comments before any positional check — a guard that greps raw source
// fails (or passes) on its own explanation.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log("  ✓ " + msg); else { fails++; console.error("  ✗ " + msg); } };

console.log("test-rails-failed-is-not-covered");

/* ── 1. The parser, executed ─────────────────────────────────────────────── */
const cortezFailed = { covered: true, data: { failed: true, covered: false, citySlug: "cortez", cityLabel: "Cortez", places: {}, thin: ["breakfast", "eat"], railTotals: {} } };
const live = liveFromRailsResponse(cortezFailed);
ok(isFailedRailsResponse(cortezFailed), "the incident payload (covered:true wrapping data.failed:true) is recognised as FAILED");
ok(live.covered === false && live.cityLabel === "" && live.citySlug === null && Object.keys(live.places).length === 0,
  "…and parses to the honest empty — no city label, no slug, no rails (was: 'near Cortez' over empty composers)");
ok(JSON.stringify(live) === JSON.stringify(emptyRailLive()), "…byte-identical to emptyRailLive()");
ok(isFailedRailsResponse({ covered: false, failed: true, data: null }), "the route's new top-level shape is recognised as FAILED");
ok(!isFailedRailsResponse({ covered: false, data: null }), "out-of-coverage (covered:false, no failed flag) is NOT failed — that one really is 'not live here'");
ok(!isFailedRailsResponse({ covered: true, data: { covered: true, failed: false, citySlug: "parrish", places: { breakfast: [{ id: "a" }] } } }),
  "a completed build is not failed");
const good = liveFromRailsResponse({ covered: true, data: { covered: true, failed: false, citySlug: "parrish", cityLabel: "Parrish", places: { breakfast: [{ id: "a", name: "First Watch" }] } } });
ok(good.covered === true && good.cityLabel === "Parrish" && good.places.breakfast.length === 1, "positive control: a real Parrish payload still parses to Parrish");
ok(!isFailedRailsResponse(null) && !isFailedRailsResponse("x"), "garbage is not failed (it is handled as missing by the caller)");

/* ── 2. The route ────────────────────────────────────────────────────────── */
const ROUTE = code(read("app/api/rails/route.js"));
const degradedIdx = ROUTE.search(/if\s*\x28degraded\x29\s*\{[\s\S]*?covered:\s*false,\s*failed:\s*true,\s*data:\s*null/);
const coveredIdx = ROUTE.search(/covered:\s*true,\s*data:\s*delivered/);
ok(degradedIdx !== -1, "route: the degraded branch returns { covered:false, failed:true, data:null }");
ok(coveredIdx !== -1 && degradedIdx !== -1 && degradedIdx < coveredIdx, "route: the degraded return comes BEFORE the covered:true return, so a failed build can never reach it");
ok(/if\s*\x28degraded\x29\s*\{[\s\S]*?.Cache-Control.:\s*.no-store./.test(ROUTE), "route: the failed answer is no-store (v8.74 rule kept)");
ok(/catch\s*\x28e\x29\s*\{[\s\S]*?covered:\s*false,\s*failed:\s*true,\s*data:\s*null/.test(ROUTE), "route: a thrown build also says failed:true");
ok(!/.Cache-Control.:\s*degraded\s*\?/.test(ROUTE), "route: no leftover 'degraded ? no-store : …' ternary on the covered:true return (the branch is gone, not duplicated)");

/* ── 3. The client ───────────────────────────────────────────────────────── */
const RAIL = code(read("app/components/DaypartRail.js"));
ok(/import\s*\{[^}]*\bisFailedRailsResponse\b[^}]*\}\s*from\s*.\.\.\/\.\.\/lib\/locationHonesty\.js./.test(RAIL),
  "DaypartRail imports isFailedRailsResponse from the honesty module");
const applyBody = (RAIL.match(/const apply = \x28j\x29 => \{([\s\S]*?)\n\s{4}\};/) || [])[1] || "";
ok(applyBody.length > 0, "DaypartRail: apply(j) found");
ok(/if\s*\x28isFailedRailsResponse\x28j\x29\x29\s*\{[\s\S]*?setRailLoad\x28LOAD_FAILED\x29/.test(applyBody),
  "apply(): a failed answer lands on LOAD_FAILED — 'couldn't reach the ranking service', never 'not live here'");
ok(/if\s*\x28isFailedRailsResponse\x28j\x29\x29\s*\{[\s\S]*?setLive\x28\x28prev\x29\s*=>\s*\x28prev == null \? emptyRailLive\x28\x29 : prev\x29\x29/.test(applyBody),
  "apply(): a failed answer keeps a good payload already on screen (v8.73 rule) and empties only a first load");
const failIdx = applyBody.search(/isFailedRailsResponse\x28j\x29/);
const coveredClientIdx = applyBody.search(/const covered = /);
ok(failIdx !== -1 && coveredClientIdx !== -1 && failIdx < coveredClientIdx, "apply(): the failed check runs BEFORE the covered/uncovered decision");

ok(/const RAILS_FED_COMPOSERS = SHARED_POOL_COMPOSER_RAILS/.test(RAIL), "RAILS_FED_COMPOSERS uses the shared source-paging identity list (the composers with no fetch of their own)");
ok(/const composerWaiting = !!\x28selRail && RAILS_FED_COMPOSERS\.includes\x28selRail\.id\x29 && railLoad !== .live.\x29/.test(RAIL),
  "composerWaiting is true until the rails request has actually landed");
ok(/\{selRail && selRail\.id === .breakfast. && !composerWaiting \? \x28\s*<BreakfastRails/.test(RAIL),
  "BreakfastRails renders only when the rails answer is live — 'No nearby place clearly qualifies' is never said about a pending or failed request");
ok(/\{selRail && selRail\.id === .eat. && !composerWaiting \? \x28\s*<WorthEatingRails/.test(RAIL),
  "WorthEatingRails renders only when the rails answer is live");
const chainSites = (RAIL.match(/selRail && \x28!railOwnsItsOwnAnswer \|\| composerWaiting\x29/g) || []).length;
ok(chainSites === 3, `the shared load chain (skeleton / thin / terminal) speaks for a waiting composer at all 3 sites (found ${chainSites})`);
ok(!/selRail && !railOwnsItsOwnAnswer && isPending\x28railLoad\x29/.test(RAIL), "no leftover chain site that still excludes composers from the skeleton");

/* ── 4. Healthy empty is hidden; outages remain explicit ───────────────── */
const BK = read("app/components/BreakfastRails.js");
ok(/visibleRails/.test(BK)
  && railRenderState([]) === RAIL_RENDER_STATE.HIDDEN
  && railRenderState([], { loading: true }) === RAIL_RENDER_STATE.LOADING
  && railRenderState([], { error: true }) === RAIL_RENDER_STATE.ERROR,
"Breakfast hides a healthy empty render plan while the shared policy keeps loading and outage states distinct");

/* ── 5. "Use my current location" means NOW ─────────────────────────────── */
// Same morning, same tap: PostHog recorded recenter_to_me hadFix:true, i.e.
// the button reused the deviceLoc already in state instead of asking the
// device. That is correct for a fix taken seconds ago and wrong for a tab
// opened hours earlier somewhere else. The shortcut is now gated on the age
// of the fix; an old one falls through to the fresh high-accuracy request.
const HOME = code(read("app/home.js"));
ok(/const deviceLocAtRef = useRef\x280\x29/.test(HOME), "home: deviceLocAtRef records WHEN the GPS fix was taken");
ok((HOME.match(/deviceLocAtRef\.current = Date\.now\x28\x29/g) || []).length === 2, "home: both GPS success handlers (mount + recenter) stamp the fix time — and the IP fallback does not");
ok(/const fixFresh = deviceLocAtRef\.current > 0 && Date\.now\x28\x29 - deviceLocAtRef\.current < GPS_FIX_FRESH_MS/.test(HOME), "home: recenterToMe computes fix freshness");
ok(/if \x28!locApprox && fixFresh && deviceLoc && isFinite\x28deviceLoc\.lat\x29\x29/.test(HOME), "home: the recenter shortcut requires a FRESH real fix; a stale one re-asks the device");
const ipFallbackBody = (HOME.match(/const ipFallback = async \x28\x29 => \{([\s\S]*?)\n\s{4}\};/) || [])[1] || "";
ok(/setDeviceLoc/.test(ipFallbackBody) && /setLocApprox\(true\)/.test(ipFallbackBody), "positive control: the IP fallback body was found and does set deviceLoc + locApprox(true)");
ok(ipFallbackBody.length > 0 && !/deviceLocAtRef/.test(ipFallbackBody), "home: the IP fallback never stamps a GPS fix time (an IP point is not a fix)");

// Execute the actual GET body with only its external dependencies substituted.
// HTTP monitors must observe a failure too; JSON flags alone leave them green.
const routeRaw = read("app/api/rails/route.js");
const marker = "export async function GET(req) {";
const routeBody = routeRaw.slice(routeRaw.indexOf(marker) + marker.length).trim().slice(0, -1);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const invokeGet = new AsyncFunction("deps", "req",
  "const { NextResponse, LANDING_CITIES, DAYPART_IDS, nearestCity, geoCell, fastCachedRail, railMenuData, dedupeWire, windowRailData } = deps;\n" + routeBody);
async function routeCase(value, throws = false, covered = true) {
  return invokeGet({
    NextResponse: { json: (body, options) => Response.json(body, options) },
    LANDING_CITIES: {}, DAYPART_IDS: ["morning"], nearestCity: () => covered ? "sarasota" : null,
    geoCell: (n) => n.toFixed(2),
    railMenuData: async () => { if (throws) throw new Error("fixture database timeout"); return value; },
    fastCachedRail: async (_key, loader) => ({ value: await loader(), state: "miss" }),
    dedupeWire: (v) => v, windowRailData: (v) => v,
  }, { nextUrl: new URL("https://fixture.invalid/api/rails?lat=27.34&lng=-82.53&band=morning") });
}
for (const [value, throws] of [[null, false], [{ failed: true }, false], [null, true]]) {
  const response = await routeCase(value, throws);
  const body = await response.json();
  ok(response.status === 503 && !response.ok, "executed GET: incomplete or thrown inventory is HTTP 503");
  ok(body.failed === true && body.covered === false && body.data === null, "executed GET: outage has no invented coverage or inventory");
  ok(response.headers.get("cache-control") === "no-store", "executed GET: outage cannot enter CDN cache");
}
const successful = await routeCase({ failed: false, places: { breakfast: [{ id: "real" }] } });
ok(successful.status === 200 && (await successful.json()).covered === true, "executed GET: completed inventory remains HTTP 200 and covered");
const uncovered = await routeCase(null, false, false);
ok(uncovered.status === 200 && !(await uncovered.json()).failed, "executed GET: a genuinely uncovered location stays distinct from an outage");

// Execute the existing client apply callback against a failed legacy 200 payload.
const applyReal = new Function("j", "setLive", "setRailLoad", "onCoverage", "isFailedRailsResponse", "emptyRailLive", "liveFromRailsResponse", "LOAD_FAILED",
  "let cancelled = false, landed = false;\n" + applyBody);
let kept = good, loadState = "live", coverageState;
applyReal(cortezFailed, (v) => { kept = typeof v === "function" ? v(kept) : v; },
  (v) => { loadState = v; }, (v) => { coverageState = v; },
  isFailedRailsResponse, emptyRailLive, liveFromRailsResponse, "failed");
ok(kept === good && loadState === "failed" && coverageState === "error", "executed client: a failed payload preserves prior good data and selects the retry state");

if (fails) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
console.log("  all green");

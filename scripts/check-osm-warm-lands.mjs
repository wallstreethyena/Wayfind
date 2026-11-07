// scripts/check-osm-warm-lands.mjs — locks the fix for the owner briefing line
// "Market data warm-up: 0 live · 0 cached · 22 unavailable of 22 markets"
// (owner screenshot, 2026-11-06: "Fix please").
//
// Measured root cause: wf_places_cache held ZERO wf-osm rows, ever, so the
// durable OSM fallback in app/api/outdoors/route.js had never been filled and
// the live site answered counts.osm "unavailable" (Sarasota: 3 places). Three
// faults kept it empty:
//   1. the daily warm fanned 4 markets out at once, each racing 2 hosts, but
//      overpass-api.de grants an IP only 2 query slots, so the warm starved
//      itself into 429s every morning;
//   2. the second host overpass.kumi.systems was renamed
//      overpass.private.coffee;
//   3. live successes were written with an un-awaited fetch that serverless
//      can freeze before the write lands.
// Plus: expired rows were refused, contradicting the standing policy that
// cache rows are never deleted and serve as the stale fallback.
import { readFileSync } from "fs";
import { buildOwnerBriefing, withBriefingOperations, briefingText } from "../lib/commandCenter/briefing.js";

let pass = 0;
const fail = (m) => { console.error("check-osm-warm-lands: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const body = (code, sig) => { const at = code.indexOf(sig); return at < 0 ? "" : code.slice(at, code.indexOf("\n}", at)); };

const route = strip(readFileSync(new URL("../app/api/outdoors/route.js", import.meta.url), "utf8"));
const cron = strip(readFileSync(new URL("../app/api/cron/route.js", import.meta.url), "utf8"));

// Hosts: the renamed mirror, never the dead name.
ok(!/overpass\.kumi\.systems/.test(route), "the renamed overpass.kumi.systems host is gone from code");
ok(/overpass\.private\.coffee/.test(route) && /overpass-api\.de/.test(route), "both live Overpass hosts are configured");

// Cache reads serve stale rows instead of discarding them.
const get = body(route, "async function osmCacheGet(");
ok(get && !/getTime\(\) < Date\.now\(\)\) return null/.test(get), "an expired OSM row is served as the stale fallback, not thrown away");

// Writes are awaited / held open.
const resolve = body(route, "async function resolveOsm(");
ok(/await osmCacheSet\(osmKey, osm\.places\)/.test(resolve), "a live success on the request path is awaited before responding, so the write lands");
ok(/after\(/.test(resolve) && /pendingWrites/.test(resolve), "the background refresh is held open with after() until its write lands");

// Warm mode: cron-only, one slot, write verified.
const getRoute = body(route, "export async function GET(");
ok(/searchParams\.get\("warm"\) === "1"/.test(getRoute) && /Bearer \$\{secret\}/.test(getRoute) && /status: 401/.test(getRoute), "warm mode is gated on CRON_SECRET so the public cannot trigger long Overpass queries");
const warm = body(route, "async function warmOsm(");
ok(/sequential: true/.test(warm), "the warm holds one Overpass slot at a time");
ok(/const saved = await osmCacheSet\(/.test(warm) && /if \(saved\) return \{ osm: "live"/.test(warm), "the warm only reports live once the cache write succeeded");

// Cron: sequential, time-boxed, deferred is not unavailable.
const cw = body(cron, "async function warmOsm(");
ok(cw && !/Promise\.all\(/.test(cw) && /for \(const city of cities\)/.test(cw), "the cron warms one market at a time — no fan-out that starves the 2-slot Overpass limit");
ok(/WARM_DEADLINE_MS/.test(cw) && /deferred\+\+/.test(cw), "the cron is time-boxed and reports leftovers as deferred");
ok(/warm=1/.test(cw) && /authorization: `Bearer \$\{secret\}`/.test(cw), "the cron calls the authenticated warm mode");

// Briefing wording: behavioral, through the real renderer.
const base = buildOwnerBriefing({ now: new Date("2026-11-06T11:00:00Z") });
const text = briefingText(withBriefingOperations(base, { osmWarm: { live: 3, cached: 10, stale: 2, missed: 1, deferred: 6, total: 22 }, notes: [] }));
ok(/3 refreshed · 10 cached · 2 serving last good copy · 1 unavailable · 6 queued for tomorrow of 22 markets/.test(text), "the briefing separates refreshed, cached, stale, unavailable and deferred markets");
const legacy = briefingText(withBriefingOperations(base, { osmWarm: { live: 0, cached: 0, missed: 22, total: 22 }, notes: [] }));
ok(/0 refreshed · 0 cached · 22 unavailable of 22 markets/.test(legacy), "an older payload without stale/deferred still renders cleanly");

console.log(`check-osm-warm-lands: OK — ${pass} assertions (warm is sequential, authenticated, write-verified; stale rows serve; briefing is honest)`);

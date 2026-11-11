// scripts/check-outdoors-cache-first.mjs — locks the v6.51 fix for "the beach
// tab takes a long time" (owner, with screenshot: stalled loading skeletons on
// Home while parks/beaches/piers were still resolving).
//
// Root cause: app/api/outdoors/route.js fans out to NPS + RIDB + OpenStreetMap
// (Overpass). Overpass is DOCUMENTED in that file as unreliable from cloud
// IPs — a live miss is "the NORM from Vercel, not the exception" — and the
// route already keeps a 7-day durable Supabase cache for exactly that case.
// But the cache was only ever consulted AFTER the live attempt had already
// run out its ~4.5s wall and failed, so the fast path never actually got
// used: every cold OSM miss cost the full ~4-4.5s before the route could
// respond at all, and Google/Foursquare results sat behind it because
// lib/sources.js searchPlaces() Promise.all's all three sources together.
//
// The fix is resolveOsm(): the live Overpass attempt and the cache lookup
// start on the SAME tick, and a cache HIT short-circuits the response the
// moment it lands (~100-300ms) instead of waiting out the live wall first.
// The live attempt keeps running in the background to refresh the cache for
// next time. A geo bucket with genuinely no cache still costs the full wall
// — nothing got slower, the common (already-seen-this-area) case got much
// faster. These assertions are STRUCTURAL (they read the route's source),
// matching how the rest of this codebase locks server-route behavior that
// can't be invoked directly without mocking three live upstream APIs.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-outdoors-cache-first: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const src = readFileSync(new URL("../app/api/outdoors/route.js", import.meta.url), "utf8");
// Strip comments so prose can never make an assertion pass for the wrong
// reason (the exact failure mode check-editorial-publish.mjs guards against).
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(code.length > src.length * 0.25, "stripping comments left the code intact — a runaway /* would blank the file and every assertion below would pass for the wrong reason");

// v7.1 (owner brief 2026-11-06) — the invariant above, made strict. The
// v6.51 race still let every COLD request pay the ~4-4.5s Overpass wall, and
// production measured exactly that on every request (no OSM row had ever been
// written). Visitors now never call Overpass at all: OSM comes from the
// regional inventory (lib/osmRegional.js), refreshed only by the protected
// warm. Behavior is locked in scripts/test-osm-regional.mjs; this guard keeps
// the visitor-latency side.
const fnAt = code.indexOf("async function osmForVisitor(");
ok(fnAt >= 0, "osmForVisitor() exists — the visitor OSM path");
const fnBody = code.slice(fnAt, code.indexOf("\n}", fnAt));
ok(/await readRegions\(sb\(\), regions\.map\(\(g\) => g\.slug\)\)/.test(fnBody), "the visitor path reads saved regions (one bounded Supabase read)");
ok(!/fromOSM|fetchRegion|warmRegions|interpreter/.test(fnBody), "the visitor path never starts a live Overpass request — nothing to wait on");
const lib = readFileSync(new URL("../lib/osmRegional.js", import.meta.url), "utf8");
const readAt = lib.indexOf("export async function readRegions(");
const readBody = lib.slice(readAt, lib.indexOf("\n}", readAt));
ok(/timeoutMs = 2500/.test(readBody) && /new AbortController\(\)/.test(readBody) && /signal: ctrl\.signal/.test(readBody), "the saved-region read is bounded (2.5s abort) — a slow Supabase read can never become the hang");

const getAt = code.indexOf("export async function GET(");
const getBody = code.slice(getAt);
ok(/Promise\.allSettled\(\[wall\(fromNPS\([^)]*\)\), wall\(fromRIDB\([^)]*\)\), osmForVisitor\(lat, lng, radius\)\]\)/.test(getBody), "NPS, RIDB and the OSM read all run together in ONE allSettled — no sequential leg");
ok(/Overpass servers aggressively throttle/.test(src), "the OSM-unreliability rationale stays documented — future edits should not un-learn why this exists");
ok(/TTL = 6 \* 3600 \* 1000/.test(src), "the 6h success mem-cache window is unchanged");
ok(/10 \* 60 \* 1000/.test(src), "the 10-minute failure mem-cache window is unchanged — a transient OSM outage still is not sticky");
ok(/STALE_MAX_MS = 7 \* 24 \* 3600 \* 1000/.test(lib), "the 7-day OSM serve window is unchanged (now enforced on the provider's verification time)");

console.log(`check-outdoors-cache-first: OK — ${pass} assertions (visitors never wait on Overpass; bounded saved-region read; fail-soft windows unchanged)`);
